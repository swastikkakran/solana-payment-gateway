import { ZodType } from "zod";
import { ApiError } from "../utils/api-error.js";
import { Request, Response, NextFunction } from "express";

export const validateRequest = (schema: ZodType) => (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    
    if (!result.success) {
        const errors = result.error.issues.map(e => ({
            field: e.path[0] as string | number | undefined,
            message: e.message
        }));
        throw new ApiError(400, "Validation failed", errors);
    }

    req.body = result.data
    next()
}