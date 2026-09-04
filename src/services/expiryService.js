const Job = require("../models/Job");
const Property = require("../models/Property");
const HousingRequest = require("../models/HousingRequest");
const MarketListing = require("../models/MarketListing");
const { createNotification } = require("./notificationService");

const markUnconfirmedProperties = async (now) => {
  const items = await Property.find({ status: "ACTIVE", availabilityStatus: "AVAILABLE", freshnessDueAt: { $lte: now }, expiresAt: { $gt: now }, deletedAt: null }).select("ownerId status availabilityStatus statusHistory");
  await Promise.all(items.map(async (property) => {
    property.availabilityStatus = "NOT_SURE";
    property.freshnessReminderSentAt = now;
    property.statusHistory.push({ status: property.status, availabilityStatus: "NOT_SURE", action: "AUTO_MARKED_NOT_SURE", note: "Availability was not confirmed within 7 days", changedAt: now });
    await property.save();
    await createNotification({
      userId: property.ownerId,
      type: "PROPERTY_AVAILABILITY_CONFIRMATION",
      title: { en: "Is your rental still available?", bn: "আপনার ভাড়ার পোস্ট কি এখনো Available?" },
      body: { en: "The listing was marked Not sure because it was not updated for 7 days. Confirm availability to restore the Available badge.", bn: "৭ দিন আপডেট না করায় পোস্টটি Not sure করা হয়েছে। Available ব্যাজ ফেরাতে availability নিশ্চিত করুন।" },
      data: { propertyId: property._id, availabilityStatus: "NOT_SURE" },
      sourceKey: `PROPERTY_AVAILABILITY_CONFIRMATION:${property._id}:${now.toISOString().slice(0, 10)}`,
      push: true,
    });
  }));
  return items.length;
};

const expireListings = async () => {
  const now = new Date();
  const notSureProperties = await markUnconfirmedProperties(now);
  const [properties, jobs, housingRequests, marketListings] = await Promise.all([
    Property.updateMany({ status: "ACTIVE", expiresAt: { $lte: now } }, { $set: { status: "EXPIRED" } }),
    Job.updateMany({ status: "ACTIVE", $or: [{ expiresAt: { $lte: now } }, { applicationDeadline: { $lt: now } }] }, { $set: { status: "EXPIRED" } }),
    HousingRequest.updateMany({ status: { $in: ["ACTIVE", "MATCHED"] }, expiresAt: { $lte: now } }, { $set: { status: "EXPIRED" } }),
    MarketListing.updateMany({ status: "ACTIVE", expiresAt: { $lte: now } }, { $set: { status: "EXPIRED" } }),
  ]);
  return {
    properties: properties.modifiedCount,
    jobs: jobs.modifiedCount,
    housingRequests: housingRequests.modifiedCount,
    marketListings: marketListings.modifiedCount,
    notSureProperties,
  };
};

module.exports = { expireListings };
