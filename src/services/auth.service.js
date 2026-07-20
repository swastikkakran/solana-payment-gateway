import { ApiError } from "../utils/api-error.js";
import { generateApiKey, generateSecretKey, encrypt } from "../utils/crypto.js";
import { merchantModel } from "../models/merchant.model.js";
import bcrypt from "bcrypt";


const registerService = async function (email, webhookUrl, payoutWallet) {
    
    const existingUser = await merchantModel.findOne({ email: email });
    if (existingUser) throw new ApiError(409, "Email already exists!");

    const apiKey = generateApiKey()
    const apiSecret = generateSecretKey()
    const webhookSecret = generateSecretKey()

    const apiSecretHash = await bcrypt.hash(apiSecret, 10);
    const { ciphertext, iv, authTag } = encrypt(webhookSecret);

    const user = await merchantModel.create({
        email: email,
        apiKey: apiKey,
        apiSecretHash: apiSecretHash,
        webhookUrl: webhookUrl,
        webhookSecretHash: {
            encryptedWebhookSecret: ciphertext,
            iv: iv,
            authTag: authTag
        },
        payoutWallet: payoutWallet
    })

    const registerPayload = { apiKey, apiSecret, webhookSecret }
    return registerPayload;
}
