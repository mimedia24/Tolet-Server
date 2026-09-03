const mongoose = require("mongoose");
const {
  COMMERCIAL_CATEGORIES,
  PROPERTY_AMENITIES,
  PROPERTY_KINDS,
  PROPERTY_AVAILABILITY_STATUSES,
  PROPERTY_STATUSES,
  RESIDENTIAL_CATEGORIES,
  TENANT_TYPES,
} = require("../constants/platform");
const { localizedContentSchema, locationSchema, mediaSchema } = require("./shared");

const propertySchema = new mongoose.Schema(
  {
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    kind: { type: String, enum: PROPERTY_KINDS, required: true, index: true },
    category: { type: String, enum: [...RESIDENTIAL_CATEGORIES, ...COMMERCIAL_CATEGORIES], required: true, index: true },
    translations: { type: localizedContentSchema, required: true },
    rent: { type: Number, required: true, min: 0, max: 100000000, index: true },
    negotiable: { type: Boolean, default: false },
    tenantTypes: { type: [{ type: String, enum: TENANT_TYPES }], default: ["ANY"], index: true },
    listingParty: { type: String, enum: ["OWNER", "AGENT"], default: "OWNER", index: true },
    brokerageFee: { type: Number, default: 0, min: 0, max: 10000000 },
    costs: {
      advance: { type: Number, default: 0, min: 0 },
      serviceCharge: { type: Number, default: 0, min: 0 },
      parkingCharge: { type: Number, default: 0, min: 0 },
      waterBill: { type: Number, default: 0, min: 0 },
      gasBill: { type: Number, default: 0, min: 0 },
      otherCharge: { type: Number, default: 0, min: 0 },
    },
    attributes: {
      bedrooms: { type: Number, min: 0, max: 100 },
      bathrooms: { type: Number, min: 0, max: 100 },
      kitchens: { type: Number, min: 0, max: 20 },
      balconies: { type: Number, min: 0, max: 50 },
      sizeSqft: { type: Number, required: true, min: 1, max: 10000000, index: true },
      floor: { type: Number, min: -10, max: 300 },
      totalFloors: { type: Number, min: 0, max: 300 },
      minimumStayMonths: { type: Number, min: 0, max: 120 },
      roadFacing: Boolean,
      roadType: { type: String, enum: ["MAIN_ROAD", "INSIDE_ROAD", "OTHER"] },
      suitableFor: [{ type: String, trim: true, maxlength: 60 }],
      gasType: { type: String, enum: ["PIPELINE", "LPG", "NONE"] },
      electricityMeter: { type: String, enum: ["PREPAID", "POSTPAID", "SHARED"] },
      waterSource: { type: String, enum: ["WASA", "DEEP_TUBEWELL", "OTHER"] },
    },
    amenities: [{ type: String, enum: PROPERTY_AMENITIES }],
    location: { type: locationSchema, required: true },
    media: { type: [mediaSchema], validate: [(value) => value.length <= 10, "Maximum 10 media items"] },
    videoUrl: { type: String, trim: true, maxlength: 1000, default: "" },
    tour360Url: { type: String, trim: true, maxlength: 1000, default: "" },
    model3dUrl: { type: String, trim: true, maxlength: 1000, default: "" },
    contact: {
      ownerName: { type: String, trim: true, maxlength: 100, default: "" },
      phoneVisibility: { type: String, enum: ["PUBLIC", "AFTER_LOGIN", "IN_APP_ONLY"], default: "IN_APP_ONLY" },
    },
    availableFrom: { type: Date, required: true, index: true },
    status: { type: String, enum: PROPERTY_STATUSES, default: "DRAFT", index: true },
    availabilityStatus: { type: String, enum: PROPERTY_AVAILABILITY_STATUSES, default: "AVAILABLE", index: true },
    publishedAt: { type: Date, index: true },
    lastAvailabilityConfirmedAt: Date,
    freshnessDueAt: { type: Date, index: true },
    freshnessReminderSentAt: Date,
    statusHistory: [{
      status: { type: String, enum: PROPERTY_STATUSES },
      availabilityStatus: { type: String, enum: PROPERTY_AVAILABILITY_STATUSES },
      action: { type: String, trim: true, maxlength: 80 },
      note: { type: String, trim: true, maxlength: 500 },
      changedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      changedAt: { type: Date, default: Date.now },
    }],
    moderation: {
      reason: { type: String, trim: true, maxlength: 1000 },
      reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      reviewedAt: Date,
      duplicateOf: { type: mongoose.Schema.Types.ObjectId, ref: "Property" },
    },
    verificationStatus: { type: String, enum: ["UNVERIFIED", "PENDING", "VERIFIED", "REJECTED"], default: "UNVERIFIED", index: true },
    expiresAt: { type: Date, index: true },
    stats: {
      views: { type: Number, default: 0 },
      saves: { type: Number, default: 0 },
      enquiries: { type: Number, default: 0 },
      likes: { type: Number, default: 0, min: 0 },
      comments: { type: Number, default: 0, min: 0 },
    },
    deletedAt: Date,
  },
  { timestamps: true, versionKey: false }
);

propertySchema.index({ "location.point": "2dsphere" });
propertySchema.index({ "translations.en.title": "text", "translations.en.description": "text", "translations.bn.title": "text", "translations.bn.description": "text", "location.area": "text", "location.city": "text" });
propertySchema.index({ status: 1, kind: 1, category: 1, rent: 1, publishedAt: -1 });
propertySchema.index({ status: 1, tenantTypes: 1, "location.city": 1, "location.area": 1 });
propertySchema.index({ status: 1, "location.district": 1, createdAt: -1 });

propertySchema.pre("validate", function validateCategory(next) {
  const valid = this.kind === "RESIDENTIAL" ? RESIDENTIAL_CATEGORIES.includes(this.category) : COMMERCIAL_CATEGORIES.includes(this.category);
  next(valid ? undefined : new Error(`Category ${this.category} is invalid for ${this.kind}`));
});

module.exports = mongoose.model("Property", propertySchema);
