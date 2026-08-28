const mongoose = require("mongoose");
const { DISTRICT_VALUES } = require("../constants/districts");
const {
  MARKET_CATEGORIES,
  MARKET_CONDITIONS,
  MARKET_LISTING_STATUSES,
} = require("../constants/platform");
const { localizedContentSchema, mediaSchema } = require("./shared");

const marketListingSchema = new mongoose.Schema(
  {
    sellerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    translations: { type: localizedContentSchema, required: true },
    category: {
      type: String,
      enum: MARKET_CATEGORIES,
      required: true,
      index: true,
    },
    condition: {
      type: String,
      enum: MARKET_CONDITIONS,
      required: true,
      index: true,
    },
    price: { type: Number, required: true, min: 0, max: 1000000000, index: true },
    negotiable: { type: Boolean, default: false },
    district: { type: String, enum: DISTRICT_VALUES, required: true, index: true },
    media: {
      type: [mediaSchema],
      validate: [(value) => value.length <= 8, "Maximum 8 marketplace images"],
    },
    attributes: {
      brand: { type: String, trim: true, maxlength: 80, default: "" },
      model: { type: String, trim: true, maxlength: 120, default: "" },
      physicalCondition: { type: String, trim: true, maxlength: 300, default: "" },
      warranty: {
        type: String,
        enum: ["NONE", "SHOP", "MANUFACTURER"],
        default: "NONE",
      },
      features: [{ type: String, trim: true, maxlength: 100 }],
    },
    contact: {
      phoneVisibility: {
        type: String,
        enum: ["AFTER_LOGIN", "IN_APP_ONLY"],
        default: "IN_APP_ONLY",
      },
    },
    status: {
      type: String,
      enum: MARKET_LISTING_STATUSES,
      default: "DRAFT",
      index: true,
    },
    publishedAt: { type: Date, index: true },
    expiresAt: { type: Date, index: true },
    statusHistory: [{
      status: { type: String, enum: MARKET_LISTING_STATUSES },
      action: { type: String, trim: true, maxlength: 80 },
      note: { type: String, trim: true, maxlength: 500 },
      changedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      changedAt: { type: Date, default: Date.now },
    }],
    moderation: {
      reason: { type: String, trim: true, maxlength: 1000, default: "" },
      reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      reviewedAt: Date,
    },
    stats: {
      views: { type: Number, default: 0 },
      saves: { type: Number, default: 0 },
      enquiries: { type: Number, default: 0 },
    },
    deletedAt: Date,
  },
  { timestamps: true, versionKey: false }
);

marketListingSchema.index({
  "translations.en.title": "text",
  "translations.en.description": "text",
  "translations.bn.title": "text",
  "translations.bn.description": "text",
  "attributes.brand": "text",
  "attributes.model": "text",
});
marketListingSchema.index({ status: 1, district: 1, category: 1, publishedAt: -1 });
marketListingSchema.index({ status: 1, district: 1, price: 1 });
marketListingSchema.index({ sellerId: 1, status: 1, updatedAt: -1 });

module.exports = mongoose.model("MarketListing", marketListingSchema);
