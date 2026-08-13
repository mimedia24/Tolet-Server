const { config } = require("../config/env");
const { getSettings } = require("../services/settingsService");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");

module.exports = (feature) => asyncHandler(async (_req, _res, next) => {
  if (!config.features[feature]) throw new ApiError(503, "FEATURE_DISABLED");
  const settings = await getSettings();
  if (settings.featureFlags?.[feature] === false) throw new ApiError(503, "FEATURE_DISABLED");
  return next();
});
