const mongoose = require("mongoose");
const { JOB_CATEGORIES, PROPERTY_AMENITIES } = require("../constants/platform");

const settingSchema = new mongoose.Schema(
  {
    key: { type: String, unique: true, default: "platform", immutable: true },
    listingExpiryDays: { type: Number, min: 1, max: 365, default: 30 },
    jobExpiryDays: { type: Number, min: 1, max: 365, default: 30 },
    requestExpiryDays: { type: Number, min: 1, max: 365, default: 30 },
    maxPropertyImages: { type: Number, min: 1, max: 30, default: 10 },
    jobCategories: { type: [{ type: String, enum: JOB_CATEGORIES }], default: JOB_CATEGORIES },
    amenities: { type: [{ type: String, enum: PROPERTY_AMENITIES }], default: PROPERTY_AMENITIES },
    featureFlags: {
      chat: { type: Boolean, default: true },
      visitBooking: { type: Boolean, default: true },
      tour360: { type: Boolean, default: true },
      services: { type: Boolean, default: false },
      boost: { type: Boolean, default: false },
      payment: { type: Boolean, default: false },
      aiSearch: { type: Boolean, default: true },
      housingRequests: { type: Boolean, default: false },
      workerProfiles: { type: Boolean, default: true },
    },
  },
  { timestamps: true, versionKey: false }
);

module.exports = mongoose.model("Setting", settingSchema);
