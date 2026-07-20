import mongoose from "mongoose";

const merchantSchema = new mongoose.Schema({
    email: {
        type: String,
        unique: true,
        trim: true,
        lowercase: true,
        index: true,
        required: true
    },
    apiKey: {
        type: String,
        unique: true,
        index: true,
        required: true
    },
    apiSecretHash: {
        type: String,
        required: true
    },
    webhookUrl: {
        type: String,
        required: true
    },
    webhookEncryption: {
        encryptedWebhookSecret: {
            type: String,
            required: true
        },
        iv: {
            type: String,
            required: true
        },
        authTag: {
            type: String,
            required: true
        }
    },
    payoutWallet: {
        type: String,
        required: true
    },
    previousCredentials: [
        {
            apiKey: String,
            apiSecretHash: String,
            expiresAt: Date
        }
    ]
}, { timestamps: true });

export const merchantModel = mongoose.model("merchant", merchantSchema);