// The Codama output is CommonJS (its package.json has no "type"), so Node's ESM loader
// cannot see its named exports. Import the whole module once here and re-export the names
// the backend needs. Everything else in onchain/ imports from this file, never from generated/.
import generated from "./generated/src/generated/index.js";

export const {
    findMerchantPda,
    findPaymentPda,
    fetchMaybeMerchant,
    fetchMaybePayment,
    getCreatePaymentInstructionAsync,
    getMarkPaidInstructionAsync,
} = generated;