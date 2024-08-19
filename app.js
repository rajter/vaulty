// TODO(developer): Set to client ID and API key from the Developer Console
const CLIENT_ID = '298164292441-org5gfrh6692tou0j0evvkm0q247u2oa.apps.googleusercontent.com';

// Discovery doc URL for APIs used by the quickstart
const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest';

// Authorization scopes required by the API; multiple scopes can be
// included, separated by spaces.
const SCOPES = 'https://www.googleapis.com/auth/drive';

let tokenClient;
let gapiInited = false;
let gisInited = false;
let vaultFolder;
let backupVaultFolder;
const vaultFolderName = "Vault";
const vaultBackupFolderName = "Backup";

const PAGES = {
    SignIn: "SignIn",
    PickVault: "PickVault",
    VaultEdit: "VaultEdit",
    SecretEdit: "SecretEdit"
}

const app = {
    signedIn: false,
    loadingModal: {
        show: false,
        message: "",
    },
    showLogs: false,
    logmessage: "",
    page: PAGES.SignIn,
    vault: null,
    vaultFiles: [],
    secretToEdit: {},
    secretToEditIndex: -1,
    addlog(message){
        if(this.logmessage.length == 0)
            this.logmessage += message;
        else
            this.logmessage += "\r\n" + message;
    },
    clearLog(){
        this.logmessage = "";
    },
    showPage(pageToShow){
        this.page = pageToShow;
    },
    showLoadingMessage(message){
        this.loadingModal.message = message;
        this.loadingModal.show = true;
    },
    hideLoadingMessage(){
        this.loadingModal.message = "";
        this.loadingModal.show = false;
    },
    setVaultFiles(files){
        this.vaultFiles = files.sort(function(a, b){return a.name.localeCompare(b.name)}); ;
    },
    async openVault(vaultFile) {

        this.showLoadingMessage(`Opening vault ${vaultFile.name}`);

        try{
            var vaultContent = await GetFileContent(vaultFile.id);
            var decryptedVaultContent = await cryptos.decrypt(vaultContent);
            var vault = JSON.parse(decryptedVaultContent);
            this.vault = vault;
            this.vault.isNew = false;
            this.vault.fileId = vaultFile.id;
            this.showPage(PAGES.VaultEdit);
        } catch(error) {
            this.vault = null;
        } finally{
            this.hideLoadingMessage();
        }
    },
    async closeVault(){
        if(isNotNullOrUndef(this.vault) && confirm("Save vault?"))
        {
            await this.saveVault();
            this.vault = null;
        }
        else
        {
            this.vault = null;
        }

        this.showPage(PAGES.PickVault);
    },
    async createVault(){
        this.closeVault();

        const name = window.prompt("Name");
        if(name == null)
        {
            this.showPage(PAGES.PickVault);
            return;
        }

        const password = window.prompt("Password");
        if(password == null)
        {
            this.showPage(PAGES.PickVault);
            return;
        }

        this.vault = {
            isNew: true,
            fileId: 0,
            name: name,
            password: password,
            secrets :[]
        };

        this.showPage(PAGES.VaultEdit);
    },
    async saveVault()
    {
        if(this.vault == null)
            return;

        this.showLoadingMessage(`Saving vault`);

        if(this.vault.isNew)
        {
            var encryptedVault = await cryptos.encryptWithPass(JSON.stringify(this.vault), this.vault.password);
            var encryptedVaultFile = await CreateFileInFolder(vaultFolder.id, this.vault.name + ".txt", encryptedVault);
            this.vault.fileId = encryptedVaultFile.id;
        }
        else
        {
            await this.backupVault();
            var encryptedVault = await cryptos.encryptWithPass(JSON.stringify(this.vault), this.vault.password);
            await UpdateFileContent(this.vault.fileId, encryptedVault);
        }

        this.hideLoadingMessage();

        await SearchForVaultFiles();
    },
    async backupVault(){
        if(isNullOrUndef(this.vault))
            return;

        var vaultContent = await GetFileContent(this.vault.fileId);
        var date = new Date();
        var dateString =  date.getDate() + "_" + (date.getMonth()+1) + "_" + date.getFullYear() + "_" + date.getHours() + "_" + date.getMinutes() + "_" + date.getSeconds();
        var backupVault = await CreateFileInFolder(backupVaultFolder.id, this.vault.name + "(" + dateString + ")" +  ".bak", vaultContent);
    },
    selectSecret(secret){
        if(isNullOrUndef(secret))
            return;

        this.vault.secrets.forEach((element) => {
            element.selected = false;
        });
        secret.selected = true;
    },
    addSecret(){
        if(this.vault == null)
            return;

        const name = window.prompt("Name");
        const username = window.prompt("Username");
        const password = window.prompt("Password");

        if(isNullOrUndef(name) || isNullOrUndef(username) || isNullOrUndef(password))
            return;

        this.vault.secrets.push({
            id: 1,
            name: name,
            username: username,
            password: password,
        });
    },
    editSecret(secret){
        if(isNullOrUndef(secret))
            return;

        this.secretToEdit = JSON.parse(JSON.stringify(secret)); // because the secret is a proxy object
        this.secretToEditIndex = this.vault.secrets.indexOf(secret);
        this.showPage(PAGES.SecretEdit);
    },
    deleteSecret(secret){
        if(isNullOrUndef(secret))
            return;

        if(window.confirm("Delete secret?"))
        {
            this.vault.secrets.splice(this.vault.secrets.indexOf(secret), 1);
        }
    },
    acceptEdit(){
        if(this.secretToEditIndex >= 0 && this.secretToEditIndex < this.vault.secrets.length)
        {
            this.vault.secrets[this.secretToEditIndex] = structuredClone(JSON.parse(JSON.stringify(this.secretToEdit)));
        }

        this.secretToEdit = {};
        this.showPage(PAGES.VaultEdit);
    },
    cancelEdit(){
        this.secretToEdit = {};
        this.showPage(PAGES.VaultEdit);
    },
    toClipboard(text) {
        navigator.clipboard.writeText(text);
    }
}

const createPassComponent = () => ({
    concealedPass: '*****',
    password: '*****',
    showPass(secret) {
        this.password = (this.password === this.concealedPass ? secret.password : this.concealedPass);
    }
});

const createGeneratePasswordComponent = () => ({
    passGeneratorOpen: false,
    passLength: 16,
    password: '',
    showPasswordGenerator() {
        this.passGeneratorOpen = !this.passGeneratorOpen;
    },
    generatePassword() {
        this.password = cryptos.generatePassword(this.passLength);
    },
    replacePassword() {
        app.$data.secretToEdit.password = this.password;
    }
});

document.addEventListener('alpine:init', () => {
    Alpine.data('app', () => app);
    Alpine.data('passwordComponent', createPassComponent);
    Alpine.data('generatePasswordComponent', createGeneratePasswordComponent);
});

function isNullOrUndef(o){
    return o === "undefined" || o === null;
}

function isNotNullOrUndef(o){
    return !isNullOrUndef(o);
}

function gapiLoaded() {
    gapi.load('client', async () =>
    {
        await gapi.client.init({
            // apiKey: API_KEY,
            discoveryDocs: [DISCOVERY_DOC],
        });
        gapiInited = true;
    });
}

function gisLoaded() {
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: '', // defined later
        redirect_uri: '',
    });
    gisInited = true;
}

function handleAuthClick() {
    tokenClient.callback = async (resp) => {
        if (resp.error !== undefined) {
            throw (resp);
        }

        await AfterSignIn();
    };

    if (gapi.client.getToken() === null) {
        // Prompt the user to select a Google Account and ask for consent to share their data
        // when establishing a new session.
        tokenClient.requestAccessToken({ prompt: 'consent' });
    } else {
        // Skip display of account chooser and consent dialog for an existing session.
        tokenClient.requestAccessToken({ prompt: '' });
    }
}

function handleSignoutClick() {
    const token = gapi.client.getToken();
    if (token !== null) {
        google.accounts.oauth2.revoke(token.access_token);
        gapi.client.setToken('');
        app.$data.signedIn = false;
        app.$data.showPage(PAGES.SignIn);
    }
}

async function AfterSignIn()
{
    app.$data.signedIn = true;
    app.$data.showPage(PAGES.PickVault);

    vaultFolder = await FindFolder(vaultFolderName);
    if(vaultFolder == null){
        await CreateFolder(vaultFolderName);
        vaultFolder = await FindFolder(vaultFolderName);
    }

    if(vaultFolder != null){
        backupVaultFolder = await FindFolderInFolder(vaultFolder.id, vaultBackupFolderName);

        if(backupVaultFolder == null){
            await CreateSubFolder(vaultFolder.id, vaultBackupFolderName);
            backupVaultFolder = await FindFolderInFolder(vaultFolder.id, vaultBackupFolderName);
        }
    }

    if(vaultFolder != null && backupVaultFolder != null){
        await SearchForVaultFiles();
    }
    else{
        throw new Error('Folders not found');
    }
}

async function SearchForVaultFiles() {
    if(vaultFolder === 'undefined' || vaultFolder === null)
        return;

    app.$data.showLoadingMessage("Searching for vaults.");
    var files = await SearchFilesInFolder(vaultFolder.id, 'text/plain');
    if (files && files.length > 0) {
        app.$data.setVaultFiles(files);
        app.$data.hideLoadingMessage();
        console.log('Found .txt files:');
        files.forEach(file => {
            console.log(`${file.name} (ID: ${file.id})`);
        });
    }
    else {
        console.log('No .txt files found in the specified folder.');
    }
}

async function FindFolder(folderName) {
    const response = await gapi.client.drive.files.list({
        q: `mimeType='application/vnd.google-apps.folder' and name='${folderName}' and trashed=false`,
        fields: "files(id, name)"
    });

    const folders = response.result.files;

    if(folders.length > 0)
    {
        console.log(`Folder "${folderName}" already exists with ID: ${folders[0].id}`);
        return folders[0];
    }
}

async function FindFolderInFolder(parentFolderId, folderName) {
    const response = await gapi.client.drive.files.list({
        'q': `'${parentFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and name = '${folderName}'`,
        'fields': "files(id, name)"
    });

    const folders = response.result.files;

    if (folders.length > 0) {
        return folders[0];
    }
}

async function CreateFolder(folderName) {
    const fileMetadata = {
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder'
    };

    await gapi.client.drive.files.create({
        resource: fileMetadata,
        fields: 'id'
    }).then(function (response) {
        console.log(`Folder "${folderName}" created with ID: ${response.result.id}`);
    }).catch(function (error) {
        console.error("Error creating folder: ", error);
    });
}

async function CreateSubFolder(parentFolderId, folderName) {
    const fileMetadata = {
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentFolderId]
    };

    await gapi.client.drive.files.create({
        resource: fileMetadata,
        fields: 'id'
    }).then(function (response) {
        console.log(`Folder "${folderName}" created with ID: ${response.result.id}`);
    }).catch(function (error) {
        console.error("Error creating folder: ", error);
    });
}

async function SearchFilesInFolder(folderId, mimeType) {
    try{
        // Create the query to search for .txt files in the specified folder
        const query = `'${folderId}' in parents and mimeType='${mimeType}'`;

        // Make the request to the Drive API
        const response = await gapi.client.drive.files.list({
            'q': query,
            'fields': "nextPageToken, files(id, name)",
            'pageSize': 100 // Adjust the page size as needed
        });

        const files = response.result.files; // The created file object

        return files;

    } catch(error) {
        console.error('Error searching for .txt files:', error);
    }
}

async function GetFileContent(fileId) {
    try{
        var response = await gapi.client.drive.files.get({
            fileId: fileId,
            alt: 'media'
        });

        const fileContent = response.body;

        return fileContent;
    } catch (error) {
        console.error("Error getting file content: ", error);
        throw error; // Rethrow the error for further handling if needed
    }
}

async function CreateFileInFolder(folderId, fileName, fileContent) {
    const fileMetadata = {
        'name': fileName, // Name of the file
        'mimeType': 'text/plain', // MIME type of the file
        'parents': [folderId] // Specify the folder ID where the file will be created
    };

    const media = {
        mimeType: 'text/plain',
        body: fileContent // Content of the file (string parameter)
    };

    const request = {
        method: 'POST',
        path: '/upload/drive/v3/files?uploadType=multipart',
        params: {
            fields: 'id, name, parents' // Specify the fields you want in the response
        },
        headers: {
            'Content-Type': 'multipart/related; boundary=boundary'
        },
        body: CreateMultipartBody(fileMetadata, media)
    };

    try {
        const response = await gapi.client.request(request);
        const createdFile = response.result; // The created file object
        console.log('File created with ID: ' + createdFile.id);
        return createdFile; // Return the created file object
    } catch (error) {
        console.error("Error creating file: ", error);
        throw error; // Rethrow the error for further handling if needed
    }
}

function CreateMultipartBody(fileMetadata, media) {
    const boundary = 'boundary';
    const delimiter = `--${boundary}`;
    const closeDelimiter = `--${boundary}--\r\n`;

    let body = '';

    // Add file metadata
    body += `${delimiter}\r\n`;
    body += `Content-Type: application/json; charset=UTF-8\r\n\r\n`;
    body += JSON.stringify(fileMetadata) + '\r\n';

    // Add file content
    body += `${delimiter}\r\n`;
    body += `Content-Type: ${media.mimeType}\r\n\r\n`;
    body += media.body + '\r\n';
    body += closeDelimiter;

    return body;
}

async function UpdateFileContent(fileId, newFileContent) {
    const media = {
        mimeType: 'text/plain', // Specify the MIME type of the file
        body: newFileContent // New content for the file (string parameter)
    };

    const request = {
        method: 'PATCH', // Use PATCH to update the file
        path: `/upload/drive/v3/files/${fileId}?uploadType=media`,
        headers: {
            'Content-Type': media.mimeType
        },
        body: media.body // The new content of the file
    };

    try {
        const response = await gapi.client.request(request);
        const updatedFile = response.result; // The updated file object
        console.log('File updated with ID: ' + updatedFile.id);
        return updatedFile; // Return the updated file object
    } catch (error) {
        console.error("Error updating file: ", error);
        throw error; // Rethrow the error for further handling if needed
    }
}

const originalLog = console.log;
const originalError = console.error;

// Override console.log
console.log = function(...args) {
    // Show a custom message
    app.$data.addlog(args)
    // Call the original console.log with the provided arguments
    originalLog.apply(console, args);
};

// Override console.error
console.error = function(...args) {
    // Show a custom message
    app.$data.addlog(args)
    // Call the original console.error with the provided arguments
    originalError.apply(console, args);
};

