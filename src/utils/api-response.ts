class ApiResponse<T> {
    statusCode: number;
    data: T;
    message: string;
    success: boolean;
    constructor(statusCode: number, data: T, message: string, success=true) {
        this.statusCode = statusCode
        this.data = data
        this.message = message
        this.success = success
    }
}

export { ApiResponse }