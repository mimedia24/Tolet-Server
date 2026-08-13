const ApiError = require("../utils/ApiError");

module.exports = (schema) => (req, _res, next) => {
  const result = schema.safeParse({ body: req.body, query: req.query, params: req.params });
  if (!result.success) {
    const details = result.error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    }));
    return next(new ApiError(400, "VALIDATION_ERROR", undefined, details));
  }
  req.validated = result.data;
  return next();
};
