const { connectDatabase, disconnectDatabase } = require("../src/config/database");
const { config, validateProductionConfig } = require("../src/config/env");
const Property = require("../src/models/Property");
const Setting = require("../src/models/Setting");
const User = require("../src/models/User");
const WorkerProfile = require("../src/models/WorkerProfile");

const run = async () => {
  validateProductionConfig();
  await connectDatabase();
  const [users, properties, workers, settings] = await Promise.all([
    User.updateMany({ phoneVerified: true, accountStatus: { $ne: "SUSPENDED" } }, { $set: { accountStatus: "ACTIVE" } }),
    Property.updateMany({ $or: [{ tenantTypes: { $exists: false } }, { tenantTypes: { $size: 0 } }] }, { $set: { tenantTypes: ["ANY"], listingParty: "OWNER" } }),
    WorkerProfile.updateMany(
      { "serviceAreas.district": { $exists: false } },
      [{ $set: { serviceAreas: { $map: { input: "$serviceAreas", as: "area", in: { $mergeObjects: ["$$area", { district: { $ifNull: ["$$area.district", "$$area.city"] } }] } } } } }]
    ),
    Setting.findOneAndUpdate(
      { key: "platform" },
      { $set: { "featureFlags.aiSearch": true, "featureFlags.housingRequests": false, "featureFlags.workerProfiles": true }, $setOnInsert: { requestExpiryDays: config.defaultRequestExpiryDays } },
      { upsert: true, new: true, runValidators: true }
    ),
  ]);
  const districtProperties = await Property.updateMany(
    { "location.district": { $exists: false } },
    [{ $set: { "location.district": "$location.city" } }]
  );
  console.log(JSON.stringify({ migratedUsers: users.modifiedCount, migratedProperties: properties.modifiedCount, migratedPropertyDistricts: districtProperties.modifiedCount, migratedWorkers: workers.modifiedCount, settingsId: settings._id }));
  await disconnectDatabase();
};

run().catch(async (error) => {
  console.error(error);
  await disconnectDatabase();
  process.exitCode = 1;
});
