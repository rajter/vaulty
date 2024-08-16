// TODO(developer): Set to client ID and API key from the Developer Console
const CLIENT_ID = '298164292441-org5gfrh6692tou0j0evvkm0q247u2oa.apps.googleusercontent.com';
const API_KEY = '';

// Discovery doc URL for APIs used by the quickstart
const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest';

// Authorization scopes required by the API; multiple scopes can be
// included, separated by spaces.
const SCOPES = 'https://www.googleapis.com/auth/drive';

let tokenClient;
let gapiInited = false;
let gisInited = false;
let vaultFolder;

document.getElementById('authorize_button').style.visibility = 'hidden';
document.getElementById('signout_button').style.visibility = 'hidden';

console.warn("This is a warning!");

const PAGES = {
    SignIn: "SignIn",
    PickVault: "PickVault",
    VaultEdit: "VaultEdit",
    SecretEdit: "SecretEdit"
}

const app = {
    page: PAGES.SignIn,
    vault: null,
    vaultFiles: [],
    secretToEdit: {},
    secretToEditIndex: -1,
    showPage(pageToShow){
        this.page = pageToShow;
    },
    async openVault(vaultFile) {
        var vaultContent = await GetFileContent(vaultFile.id);
        var decryptedVaultContent = await cryptos.decrypt(vaultContent);

        try{
            var vault = JSON.parse(decryptedVaultContent);
            this.vault = vault;
            this.vault.isNew = false;
            this.vault.fileId = vaultFile.id;
            this.showPage(PAGES.VaultEdit);
        } catch(error) {
            this.vault = null;
        }
    },
    async closeVault(){
        if(confirm("Save vault?"))
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
        const password = window.prompt("Password");

        this.vault = {
            isNew: true,
            fileId: 0,
            name: name,
            password: password,
            secrets :[]
        }
    },
    async saveVault()
    {
        if(this.vault == null)
            return;

        if(this.vault.isNew)
        {
            var encryptedVault = await cryptos.encryptWithPass(JSON.stringify(this.vault), this.vault.password);
            var encryptedVaultFile = await CreateFileInFolder(vaultFolder.id, this.vault.name + ".txt", encryptedVault);
            this.vault.fileId = encryptedVaultFile.id;
        }
        else
        {
            var encryptedVault = await cryptos.encryptWithPass(JSON.stringify(this.vault), this.vault.password);
            await UpdateFileContent(this.vault.fileId, encryptedVault);
        }

        await SearchForVaultFiles();
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
    }
}

const createPassComponent = () => ({
    concealedPass: '*****',
    password: '*****',
    showPass(secret) {
        this.password = (this.password === this.concealedPass ? secret.password : this.concealedPass);
    }
});

document.addEventListener('alpine:init', () => {
    Alpine.data('app', () => app);
    Alpine.data('passwordComponent', createPassComponent);
});

function isNullOrUndef(o)
{
    return o === "undefined" || o === null;
}

function gapiLoaded() {
    gapi.load('client', async () =>
    {
        await gapi.client.init({
            apiKey: API_KEY,
            discoveryDocs: [DISCOVERY_DOC],
        });
        gapiInited = true;
        maybeEnableButtons();
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
    maybeEnableButtons();
}

function maybeEnableButtons() {
    if (gapiInited && gisInited) {
        document.getElementById('authorize_button').style.visibility = 'visible';
    }
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
        app.$data.showPage(PAGES.SignIn);
        document.getElementById('authorize_button').innerText = 'Authorize';
        document.getElementById('signout_button').style.visibility = 'hidden';
    }
}

async function AfterSignIn()
{
    app.$data.showPage(PAGES.PickVault);

    document.getElementById('signout_button').style.visibility = 'visible';
    document.getElementById('authorize_button').innerText = 'Refresh';

    //await ListFiles();
    vaultFolder = await FindVaultFolder();
    if(vaultFolder == null)
    {
        CreateFolder("Vault");
        vaultFolder = await FindVaultFolder();
    }

    await SearchForVaultFiles();
}

async function SearchForVaultFiles() {
    if(vaultFolder === 'undefined' || vaultFolder === null)
        return;

    var files = await SearchFilesInFolder(vaultFolder.id, 'text/plain');
    if (files && files.length > 0) {
        app.$data.vaultFiles = files;
        console.log('Found .txt files:');
        files.forEach(file => {
            console.log(`${file.name} (ID: ${file.id})`);
        });
    } else {
        console.log('No .txt files found in the specified folder.');
    }
}

async function FindVaultFolder() {
    const folderName = "Vault";
    const drive = gapi.client.drive;

    var response = await drive.files.list({
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

function CreateFolder(folderName) {
    const drive = gapi.client.drive;

    const fileMetadata = {
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder'
    };

    drive.files.create({
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
