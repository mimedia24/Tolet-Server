const mongoose = require("mongoose");
const multer = require("multer");
const { config } = require("../config/env");
const logger = require("../config/logger");
const ApiError = require("../utils/ApiError");
const { t } = require("../utils/i18n");

const notFound = (req, _res, next) => next(new ApiError(404, "NOT_FOUND", `Cannot ${req.method} ${req.originalUrl}`));

const errorHandler = (error, req, res, _next) => {
  let err = error;
  if (err instanceof mongoose.Error.CastError) err = new ApiError(404, "NOT_FOUND");
  if (err instanceof multer.MulterError) err = new ApiError(400, "VALIDATION_ERROR", err.message, { field: err.field, uploadCode: err.code });
  if (err?.code === 11000) err = new ApiError(409, "CONFLICT", undefined, err.keyValue);

  const status = err.statusCode || 500;
  const code = err.code && typeof err.code === "string" ? err.code : "SERVER_ERROR";
  const fallback = status === 500 ? "Internal server error" : err.message;
  const message = t(code, res.locals.language) === code ? fallback : t(code, res.locals.language);

  if (status >= 500) {
    logger.error({ err, requestId: req.id, method: req.method, path: req.originalUrl }, "Request failed");
  }

  const body = { success: false, code, message };
  if (err.details !== undefined) body.details = err.details;
  if (!config.isProduction && status >= 500) body.debug = err.message;
  res.status(status).json(body);
};

module.exports = { errorHandler, notFound };
