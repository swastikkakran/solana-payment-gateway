import { address, generateKeyPairSigner } from "@solana/kit";
import { encodeURL } from "@solana/pay";
import { ApiError } from "../utils/api-error.js";
import { paymentModel } from "../models/payment-request.model.js";
import { isConnected, connectMerchant } from "../watcher/connection-manager.js";
import { IMerchant } from "../models/merchant.model.js";
import { Types } from "mongoose";


const createPaymentService = async function (merchant: IMerchant, amount: number, currency: "SOL" | "USDC", label: string, message: string) {
    
    const referenceKeyPair = generateKeyPairSigner();
    const reference = (await referenceKeyPair).address;

    //creating pay url
    if (!process.env.USDC_MINT_ADDRESS) throw new ApiError(404, "usdc mint address not found!")
    const url = encodeURL({
        recipient: address(merchant.payoutWallet),
        amount,
        splToken: currency === "USDC" ? address(process.env.USDC_MINT_ADDRESS) : undefined,
        reference: reference,
        label,
        message
    });

    const solanaPayUrl = url.toString();

    const paymentRequestData = await paymentModel.create({
        merchant: merchant._id,
        reference: reference,
        amount: amount,
        currency: currency,
        label: label,
        message: message,
        expiresAt: new Date(Date.now() + (1000*60*15))
    })

    if (!isConnected(merchant._id)) {
    await connectMerchant(merchant);
    }

    return { solanaPayUrl, paymentRequestData };
}


const fetchSinglePaymentService = async function (merchant: IMerchant, paymentId: string) {
    
    const payment = await paymentModel.findOne({ _id: paymentId, merchant: merchant._id })
    if (!payment) throw new ApiError(404, "No payment found!")

    return payment
}


const fetchAllPaymentsService = async function (merchant: IMerchant, status: "pending" | "confirmed" | "expired" | "failed", page = 1, limit = 20) {

    const filter: { merchant: Types.ObjectId; status?: "pending" | "confirmed" | "expired" | "failed" } = { merchant: merchant._id };

    if (status) {
        if (!["pending", "confirmed", "expired", "failed"].includes(status)) {
            throw new ApiError(400, "Invalid status filter");
        }
        filter.status = status;
    }

    const skip = (page - 1) * limit;

    const [payments, totalCount] = await Promise.all([
        paymentModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
        paymentModel.countDocuments(filter)
    ]);

    return {
        payments,
        pagination: {
            page: Number(page),
            limit: Number(limit),
            totalCount,
            totalPages: Math.ceil(totalCount / limit)
        }
    };
};


export { createPaymentService, fetchSinglePaymentService, fetchAllPaymentsService }