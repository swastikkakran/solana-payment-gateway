import mongoose from "mongoose";
import { ApiError } from "../utils/api-error.js";

const validateObjectId = (paramName) => (req, res, next) => {
    const id = req.params[paramName];
    if (!mongoose.Types.ObjectId.isValid(id)) {
        throw new ApiError(400, `Invalid ${paramName}`);
    }
    next();
};

export { validateObjectId };