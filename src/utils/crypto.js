import crypto from "crypto";

const generateApiKey = function () {
    return crypto.randomBytes(16).toString("hex")
}

const generateSecretKey = function () {
    return crypto.randomBytes(32).toString("hex")
}

const encrypt = function (text) {

    const encryptionKey = process.env.ENCRYPTION_MASTER_KEY;
    const algorithm = 'aes-256-gcm';
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



export { generateApiKey, generateSecretKey }