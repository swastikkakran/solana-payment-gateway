import { ApiError } from "../utils/api-error.js";
import { generateApiKey, generateSecretKey, encrypt } from "../utils/crypto.js";
import { merchantModel } from "../models/merchant.model.js";
import { paymentModel } from "../models/payment-request.model.js";
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
        webhookEncryption: {
            encryptedWebhookSecret: ciphertext,
            iv: iv,
            authTag: authTag
        },
        payoutWallet: payoutWallet
    })

    const registerPayload = { apiKey, apiSecret, webhookSecret }
    return registerPayload;
}


const keyRotationService = async function (merchant) {

    merchant.previousCredentials.apiKey = merchant.apiKey;
    merchant.previousCredentials.apiSecretHash = merchant.apiSecretHash;
    merchant.previousCredentials.expiresAt = new Date(Date.now() + (1000*60*60*24))

    const newApiKey = generateApiKey()
    const newApiSecret = generateSecretKey()
    const newApiSecretHash = await bcrypt.hash(newApiSecret, 10);

    merchant.apiKey = newApiKey;
    merchant.apiSecretHash = newApiSecretHash
    await merchant.save()

    return { newApiKey, newApiSecret }
}


const deleteMerchantService = async function (merchant) {
    
    const pendingPayments = await paymentModel.findOne({ merchant: merchant._id, status: "pending" })
    if (pendingPayments) throw new ApiError(400, "Pending payment for an order! Cannot perform account deletion.")
    const deletedForm = await merchantModel.findByIdAndDelete(merchant._id)
    return deletedForm
}

export { registerService, keyRotationService, deleteMerchantService }