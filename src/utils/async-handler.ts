import { Request, Response, NextFunction, RequestHandler } from "express";

const asyncHandler = function (requestHandler: RequestHandler) {
    
    return (req: Request, res: Response, next: NextFunction) => {
        Promise
            .resolve(requestHandler(req, res, next))
            .catch((e) => { next(e) })
    }
}

export { asyncHandler }