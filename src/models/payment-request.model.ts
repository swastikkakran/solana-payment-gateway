import mongoose, { Document, Types } from "mongoose";

export interface IPayment extends Document {
    merchant: Types.ObjectId;
    reference: string;
    amount: number;
    currency: "SOL" | "USDC";
    label?: string;
    message?: string;
    status: "pending" | "confirmed" | "expired" | "failed";
    transactionSignature?: string;
    payerWallet?: string;
    expiresAt?: Date;
    confirmedAt?: Date;
}


const paymentSchema = new mongoose.Schema({
    merchant: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "merchant",
        required: true,
    },
    reference: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    amount: {
        type: Number,
        required: true
    },
    currency: {
        type: String,
        required: true,
        enum: ["SOL", "USDC"]
    },
    label: {
        type: String
    },
    message: {
        type: String
    },
    status: {
        type: String,
        required: true,
        enum: ["pending", "confirmed", "expired", "failed"],
        default: "pending"
    },
    transactionSignature: String,
    payerWallet: String,
    expiresAt: Date,
    confirmedAt: Date,
}, { timestamps: true })

export const paymentModel = mongoose.model<IPayment>("payment", paymentSchema); 