// errorHandler.ts

class ErrorHandler {
    handle(error: Error): void {
        console.error('An error occurred:', error);
        // Add custom error handling logic here
    }
}

export default new ErrorHandler();
