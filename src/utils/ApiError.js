class ApiError extends Error {
  constructor(statusCode, code, message, details = undefined) {
    super(message || code);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace(this, ApiError);
  }
}

module.exports = ApiError;
