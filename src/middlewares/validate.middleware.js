import { ApiError } from "../utilities/api-error.js";

export const validateRequest = (schema) => (req, res, next) => {
    const result = schema.safeParse(req.body);
    
    if (!result.success) {
        const errors = result.error.errors.map(e => ({
            field: e.path[0],
            message: e.message
        }));
        throw new ApiError(400, "Validation failed", errors);
    }

    req.body = result.data
    next()
}