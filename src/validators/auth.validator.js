import { z } from "zod";
import { PublicKey } from "@solana/web3.js";

const registerMerchantSchema = z.object({
    email: z
        .string()
        .email("Invalid email address"),

    webhookUrl: z
        .string()
        .url("webhookUrl must be a valid URL")
        .startsWith("https://", "webhookUrl must use HTTPS"),

    payoutWallet: z
        .string()
        .refine((val) => {
            try {
                new PublicKey(val);
                return true;
            } catch {
                return false;
            }
        }, "payoutWallet must be a valid Solana address")
});

export { registerMerchantSchema };