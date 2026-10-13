import { address, type Address } from "@solana/kit";
import { fetchMaybeMerchant, findMerchantPda } from "./codegen.js";
import { rpc } from "./client.js";

// What the rest of the backend sees. Generated types stay inside onchain/.
export interface MerchantOnChain {
    pda: Address;
    payoutWallet: Address;
    isActive: boolean;
}

// The Merchant PDA is seeded on the merchant's payout wallet.
export async function deriveMerchantPda(payoutWallet: string): Promise<Address> {
    const [pda] = await findMerchantPda({ payer: address(payoutWallet) });
    return pda;
}

// Returns null when the merchant has not registered on-chain yet.
export async function fetchMerchantAccount(payoutWallet: string): Promise<MerchantOnChain | null> {
    const pda = await deriveMerchantPda(payoutWallet);
    const account = await fetchMaybeMerchant(rpc, pda, { commitment: "confirmed" });
    if (!account.exists) return null;
    return {
        pda,
        payoutWallet: account.data.payoutWallet,
        isActive: account.data.isActive,
    };
}