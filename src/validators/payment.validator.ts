import mongoose from "mongoose";
import { ApiError } from "../utils/api-error.js";
import { Request, Response, NextFunction } from "express";

const validateObjectId = (paramName: string) => (req: Request, res: Response, next: NextFunction) => {
    const id = req.params[paramName] as string;
    if (!mongoose.Types.ObjectId.isValid(id)) {
        throw new ApiError(400, `Invalid ${paramName}`);
    }
    next();
};

export { validateObjectId };