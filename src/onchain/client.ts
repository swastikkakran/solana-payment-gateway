import { readFileSync } from "node:fs";
import {
    address,
    createSolanaRpc,
    createSolanaRpcSubscriptions,
    createKeyPairSignerFromBytes,
    pipe,
    createTransactionMessage,
    setTransactionMessageFeePayerSigner,
    setTransactionMessageLifetimeUsingBlockhash,
    appendTransactionMessageInstruction,
    signTransactionMessageWithSigners,
    sendAndConfirmTransactionFactory,
    getSignatureFromTransaction,
    assertIsTransactionWithBlockhashLifetime,
    type Instruction,
} from "@solana/kit";

function requireEnv(name: string): string {
    const value = process.env[name];
    if (!value) throw new Error(`Missing required env var: ${name}`);
    return value;
}

export const rpc = createSolanaRpc(requireEnv("SOLANA_RPC_URL"));
export const rpcSubscriptions = createSolanaRpcSubscriptions(requireEnv("SOLANA_RPC_WSS_URL"));

const ORACLE_AUTHORITY = address("48JXnfoUSJ9Hs5sE7ougT1DNprjWp5urmg8ajuQ26ZWy");

const secretKey = Uint8Array.from(
    JSON.parse(readFileSync(requireEnv("ORACLE_KEYPAIR_PATH"), "utf-8")),
);
export const oracle = await createKeyPairSignerFromBytes(secretKey);

// Fail at boot, not on the first payment, if the wrong keypair is loaded.
if (oracle.address !== ORACLE_AUTHORITY) {
    throw new Error(
        `Oracle keypair mismatch: loaded ${oracle.address}, program expects ${ORACLE_AUTHORITY}`,
    );
}

const sendAndConfirm = sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions });

// Every on-chain write goes through here. Retries are left to the caller.
export async function sendInstruction(ix: Instruction): Promise<string> {
    const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();

    const message = pipe(
        createTransactionMessage({ version: 0 }),
        (tx) => setTransactionMessageFeePayerSigner(oracle, tx),
        (tx) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
        (tx) => appendTransactionMessageInstruction(ix, tx),
    );

    const signed = await signTransactionMessageWithSigners(message);
    assertIsTransactionWithBlockhashLifetime(signed);
    await sendAndConfirm(signed, { commitment: "confirmed" });
    return getSignatureFromTransaction(signed);
}