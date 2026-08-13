const { connectDatabase, disconnectDatabase } = require("../src/config/database");
const { config, validateProductionConfig } = require("../src/config/env");
const Setting = require("../src/models/Setting");
const User = require("../src/models/User");
const { normalizeBangladeshPhone } = require("../src/utils/phone");

const run = async () => {
  validateProductionConfig();
  await connectDatabase();
  const phone = normalizeBangladeshPhone(config.superAdminPhone);
  const user = await User.findOneAndUpdate(
    { phone },
    {
      $set: { name: config.superAdminName, phoneVerified: true, role: "SUPER_ADMIN", accountStatus: "ACTIVE" },
      $addToSet: { capabilities: { $each: ["TENANT", "PROPERTY_OWNER", "EMPLOYER", "JOB_SEEKER"] } },
    },
    { new: true, upsert: true, runValidators: true }
  );
  await Setting.findOneAndUpdate(
    { key: "platform" },
    { $setOnInsert: { key: "platform", listingExpiryDays: config.defaultListingExpiryDays, jobExpiryDays: config.defaultJobExpiryDays, requestExpiryDays: config.defaultRequestExpiryDays, featureFlags: config.features } },
    { new: true, upsert: true, runValidators: true }
  );
  console.log(`Seed complete. Super Admin: ${user.phone}`);
  await disconnectDatabase();
};

run().catch(async (error) => {
  console.error(error);
  await disconnectDatabase();
  process.exitCode = 1;
});
