import { merchantModel } from "../models/merchant.model.js";
import { paymentModel } from "../models/payment-request.model.js";
import { connectMerchant } from "./connection-manager.js";

const startWatcher = async function () {

    const merchantIdsWithPending = await paymentModel.distinct("merchant", {
        status: "pending",
        expiresAt: { $gt: new Date() }
    });

    const merchants = await merchantModel.find({
        _id: { $in: merchantIdsWithPending }
    });

    for (const merchant of merchants) {
        await connectMerchant(merchant);
    }

    console.log(`Watcher started for ${merchants.length} merchant(s)`);
};

export { startWatcher };