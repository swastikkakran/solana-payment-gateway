import { createHash } from "node:crypto";
import { address, type Address } from "@solana/kit";
import { oracle, rpc, sendInstruction } from "./client.js";
import {
    fetchMaybePayment,
    findPaymentPda,
    getCreatePaymentInstructionAsync,
    getMarkPaidInstructionAsync,
} from "./codegen.js";
import { deriveMerchantPda, fetchMerchantAccount } from "./merchant-registry.js";

// What the rest of the backend sees. Generated types stay inside onchain/.
export interface PaymentOnChain {
    pda: Address;
    merchant: Address;
    amount: bigint;
    mint: Address;
    isPaid: boolean;
}

// A PDA seed is capped at 32 bytes, so the program seeds on sha256(reference).
// This must match the hash used in tests/merchant-registry.ts.
export function hashReference(reference: string): Uint8Array {
    return new Uint8Array(createHash("sha256").update(reference).digest());
}

export async function derivePaymentPda(merchantWallet: string, reference: string): Promise<Address> {
    const merchant = await deriveMerchantPda(merchantWallet);
    const [pda] = await findPaymentPda({ merchant, referenceHash: hashReference(reference) });
    return pda;
}

// Returns null when no payment record exists on-chain for this reference.
export async function fetchPaymentAccount(
    merchantWallet: string,
    reference: string,
): Promise<PaymentOnChain | null> {
    const pda = await derivePaymentPda(merchantWallet, reference);
    const account = await fetchMaybePayment(rpc, pda, { commitment: "confirmed" });
    if (!account.exists) return null;
    return {
        pda,
        merchant: account.data.merchant,
        amount: account.data.amount,
        mint: account.data.mint,
        isPaid: account.data.isPaid,
    };
}

export interface CreatePaymentParams {
    merchantWallet: string;
    reference: string;
    amount: bigint; // raw base units, e.g. lamports
    mint: string;
}

// Signed by the oracle. Returns the transaction signature, or null if the record
// already exists with the same details, so a retried call is harmless.
export async function createPayment(params: CreatePaymentParams): Promise<string | null> {
    const { merchantWallet, reference, amount } = params;
    const mint = address(params.mint);

    const merchant = await fetchMerchantAccount(merchantWallet);
    if (!merchant) throw new Error(`Merchant ${merchantWallet} is not registered on-chain`);

    const existing = await fetchPaymentAccount(merchantWallet, reference);
    if (existing) {
        if (existing.amount !== amount || existing.mint !== mint) {
            throw new Error(`On-chain payment for reference ${reference} exists with different details`);
        }
        return null;
    }

    const ix = await getCreatePaymentInstructionAsync({
        payer: oracle,
        merchant: merchant.pda,
        referenceHash: hashReference(reference),
        amount,
        mint,
    });
    return sendInstruction(ix);
}

// Signed by the oracle. Returns the transaction signature, or null if the payment is
// already marked paid, so the watcher seeing the same transfer twice is harmless.
export async function markPaid(merchantWallet: string, reference: string): Promise<string | null> {
    const payment = await fetchPaymentAccount(merchantWallet, reference);
    if (!payment) throw new Error(`No on-chain payment record for reference ${reference}`);
    if (payment.isPaid) return null;

    const ix = await getMarkPaidInstructionAsync({
        payer: oracle,
        merchant: payment.merchant,
        referenceHash: hashReference(reference),
    });
    return sendInstruction(ix);
}