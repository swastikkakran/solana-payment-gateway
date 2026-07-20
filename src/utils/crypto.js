import crypto from "crypto";

const generateApiKey = function () {
    return crypto.randomBytes(16).toString("hex")
}

const generateSecretKey = function () {
    return crypto.randomBytes(32).toString("hex")
}

const encryptionKey = Buffer.from(process.env.ENCRYPTION_MASTER_KEY, "hex");
const algorithm = 'aes-256-gcm';

const encrypt = function (text) {

    const iv = crypto.randomBytes(12)
    const cipher = crypto.createCipheriv(algorithm, encryptionKey, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');

    return {
            iv: iv.toString('hex'),
            authTag: authTag,
            ciphertext: encrypted
        };
};

function decrypt(ivHex, authTagHex, ciphertextHex) {
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');

    const decipher = crypto.createDecipheriv(algorithm, encryptionKey, iv);

    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(ciphertextHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
}

export { generateApiKey, generateSecretKey, encrypt, decrypt }