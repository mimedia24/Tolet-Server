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
      marketListingExpiryDays: config.defaultListingExpiryDays,
      featureFlags: { ...config.features, aiSearch: config.features.aiSearch, housingRequests: config.features.housingRequests, workerProfiles: config.features.workerProfiles, marketplace: true },
    });
  }
  return settings;
};

module.exports = { getSettings };
