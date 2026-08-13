const { connectDatabase, disconnectDatabase } = require("../src/config/database");
const Job = require("../src/models/Job");
const Property = require("../src/models/Property");
const User = require("../src/models/User");

const run = async () => {
  await connectDatabase();
  const now = new Date();
  const freshnessDueAt = new Date(now.getTime() + 7 * 86400000);

  const [properties, rented, jobs, users] = await Promise.all([
    Property.updateMany(
      { availabilityStatus: { $exists: false }, status: { $ne: "RENTED" } },
      [{ $set: { availabilityStatus: "AVAILABLE", publishedAt: { $ifNull: ["$publishedAt", "$createdAt"] }, lastAvailabilityConfirmedAt: { $ifNull: ["$lastAvailabilityConfirmedAt", now] }, freshnessDueAt: { $cond: [{ $eq: ["$status", "ACTIVE"] }, freshnessDueAt, "$freshnessDueAt"] }, statusHistory: { $ifNull: ["$statusHistory", []] } } }]
    ),
    Property.updateMany(
      { status: "RENTED" },
      { $set: { availabilityStatus: "RENTED" }, $unset: { freshnessDueAt: "", freshnessReminderSentAt: "" } }
    ),
    Job.updateMany(
      { "salary.disclosed": { $exists: false } },
      [{ $set: { "salary.disclosed": { $or: [{ $ne: ["$salary.amount", null] }, { $ne: ["$salary.min", null] }, { $ne: ["$salary.max", null] }] } } }, { $unset: "urgent" }]
    ),
    User.updateMany(
      { "verification.identityStatus": "VERIFIED", $or: [{ "verification.nidFrontFile": { $in: [null, ""] } }, { "verification.nidBackFile": { $in: [null, ""] } }, { "verification.selfieFile": { $in: [null, ""] } }] },
      { $set: { "verification.identityStatus": "UNVERIFIED", "verification.rejectionReason": "KYC documents required under platform v2.2" }, $unset: { "verification.reviewedBy": "", "verification.reviewedAt": "" } }
    ),
  ]);

  console.log(JSON.stringify({ migratedProperties: properties.modifiedCount, migratedRentedProperties: rented.modifiedCount, migratedJobs: jobs.modifiedCount, resetLegacyVerification: users.modifiedCount }));
  await disconnectDatabase();
};

run().catch(async (error) => {
  console.error(error);
  await disconnectDatabase();
  process.exitCode = 1;
});
