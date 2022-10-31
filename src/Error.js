export class InvalidRequestError extends Error {
    statusCode;
    responseMessage;

    constructor(message, statusCode) {
        super(message);
        
        this.statusCode = statusCode;
        this.responseMessage = message;
    }
}
