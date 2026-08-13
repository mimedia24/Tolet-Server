const { config } = require("../config/env");
const Setting = require("../models/Setting");

const getSettings = async () => {
  let settings = await Setting.findOne({ key: "platform" });
  if (!settings) {
    settings = await Setting.create({
      key: "platform",
      listingExpiryDays: config.defaultListingExpiryDays,
      jobExpiryDays: config.defaultJobExpiryDays,
      requestExpiryDays: config.defaultRequestExpiryDays,
      featureFlags: { ...config.features, aiSearch: config.features.aiSearch, housingRequests: config.features.housingRequests, workerProfiles: config.features.workerProfiles },
    });
  }
  return settings;
};

module.exports = { getSettings };
