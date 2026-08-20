import { IMerchant } from "../models/merchant.model.js";

declare global {
    namespace Express {
        interface Request {
            merchant?: IMerchant;
        }
    }
}