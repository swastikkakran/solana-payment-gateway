import crypto from "crypto";

const generateApiKey = function () {
    return crypto.randomBytes(16).toString("hex")
}

const generateSecretKey = function () {
    return crypto.randomBytes(32).toString("hex")
}


export { generateApiKey, generateSecretKey }