const ApiError = require("../utils/ApiError");

const requireCapability = (...capabilities) => (req, _res, next) => {
  if (!req.user || !capabilities.some((capability) => req.user.capabilities.includes(capability))) {
    return next(new ApiError(403, "FORBIDDEN"));
  }
  return next();
};

const requireRole = (...roles) => (req, _res, next) => {
  if (!req.user || !roles.includes(req.user.role)) return next(new ApiError(403, "FORBIDDEN"));
  return next();
};

module.exports = { requireCapability, requireRole };
