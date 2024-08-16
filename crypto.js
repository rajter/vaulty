// https://github.com/bradyjoslin/webcrypto-example

class cryptos{

    static async encrypt(data) {
        const password = window.prompt("Password");
        const encryptedData = await this.#encryptData(data, password);
        return encryptedData;
    }

    static async encryptWithPass(data, password) {
        const encryptedData = await this.#encryptData(data, password);
        return encryptedData;
    }

    static async decrypt(encryptedData) {
        const password = window.prompt("Password");
        const decryptedData = await this.#decryptData(encryptedData, password);
        return decryptedData || "decryption failed!";
    }

    static async decryptWithPass(encryptedData, password) {
        const decryptedData = await this.#decryptData(encryptedData, password);
        return decryptedData || "decryption failed!";
    }

    // PRIVATE

    static #enc = new TextEncoder();
    static #dec = new TextDecoder();

    // for large strings, use this from https://stackoverflow.com/a/49124600
    static #buff_to_base64 = (buff) => btoa(
        new Uint8Array(buff).reduce(
            (data, byte) => data + String.fromCharCode(byte), ''
        )
    );

    static #base64_to_buf = (b64) =>
        Uint8Array.from(atob(b64), (c) => c.charCodeAt(null));

    static #getPasswordKey(password){
        return window.crypto.subtle.importKey("raw", this.#enc.encode(password), "PBKDF2", false, [
            "deriveKey",
        ]);
    }

    static #deriveKey(passwordKey, salt, keyUsage) {
        return window.crypto.subtle.deriveKey(
            {
                name: "PBKDF2",
                salt: salt,
                iterations: 250000,
                hash: "SHA-256",
            },
            passwordKey,
            {
                name: "AES-GCM",
                length: 256
            },
            false,
            keyUsage
        );
    }

    static async #encryptData(secretData, password) {
        try {
            const salt = window.crypto.getRandomValues(new Uint8Array(16));
            const iv = window.crypto.getRandomValues(new Uint8Array(12));
            const passwordKey = await this.#getPasswordKey(password);
            const aesKey = await this.#deriveKey(passwordKey, salt, ["encrypt"]);
            const encryptedContent = await window.crypto.subtle.encrypt(
                {
                    name: "AES-GCM",
                    iv: iv,
                },
                aesKey,
                this.#enc.encode(secretData)
            );

            const encryptedContentArr = new Uint8Array(encryptedContent);
            let buff = new Uint8Array(
                salt.byteLength + iv.byteLength + encryptedContentArr.byteLength
            );
            buff.set(salt, 0);
            buff.set(iv, salt.byteLength);
            buff.set(encryptedContentArr, salt.byteLength + iv.byteLength);
            const base64Buff = this.#buff_to_base64(buff);
            return base64Buff;
        } catch (e) {
            console.log(`Error - ${e}`);
            return "";
        }
    }

    static async #decryptData(encryptedData, password) {
        try {
            const encryptedDataBuff = this.#base64_to_buf(encryptedData);
            const salt = encryptedDataBuff.slice(0, 16);
            const iv = encryptedDataBuff.slice(16, 16 + 12);
            const data = encryptedDataBuff.slice(16 + 12);
            const passwordKey = await this.#getPasswordKey(password);
            const aesKey = await this.#deriveKey(passwordKey, salt, ["decrypt"]);
            const decryptedContent = await window.crypto.subtle.decrypt(
                {
                    name: "AES-GCM",
                    iv: iv,
                },
                aesKey,
                data
            );
            return this.#dec.decode(decryptedContent);
        } catch (e) {
            console.log(`Error - ${e}`);
            return "";
        }
    }
}
