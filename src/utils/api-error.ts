type apiError = { field: string | number | undefined; message: string };

class ApiError extends Error {
    statusCode: number
    data: null
    success: boolean
    errors: apiError[]

    constructor(
        statusCode: number,
        message = 'something went wrong',
        errors: apiError[] = [],
        stack = ""
    ) {
        super(message)
        this.statusCode = statusCode
        this.data = null
        this.message = message
        this.success = false
        this.errors = errors

        if (stack) {
            this.stack = stack
        } else {
            Error.captureStackTrace(this, this.constructor)
        }
    }
}

export { ApiError }