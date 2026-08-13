const mongoose = require("mongoose");
const {
  COMMERCIAL_CATEGORIES,
  PROPERTY_AMENITIES,
  PROPERTY_KINDS,
  REQUEST_STATUSES,
  RESIDENTIAL_CATEGORIES,
  TENANT_TYPES,
} = require("../constants/platform");
const { localizedContentSchema } = require("./shared");

const housingRequestSchema = new mongoose.Schema(
  {
    requesterId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    kind: { type: String, enum: PROPERTY_KINDS, required: true, index: true },
    category: { type: String, enum: [...RESIDENTIAL_CATEGORIES, ...COMMERCIAL_CATEGORIES], required: true, index: true },
    translations: { type: localizedContentSchema, required: true },
    budget: {
      min: { type: Number, default: 0, min: 0, max: 100000000 },
      max: { type: Number, required: true, min: 0, max: 100000000, index: true },
      negotiable: { type: Boolean, default: false },
    },
    tenantType: { type: String, enum: TENANT_TYPES, default: "ANY", index: true },
    occupants: { type: Number, default: 1, min: 1, max: 100 },
    requirements: {
      bedrooms: { type: Number, min: 0, max: 100 },
      bathrooms: { type: Number, min: 0, max: 100 },
      minSizeSqft: { type: Number, min: 0, max: 10000000 },
      furnished: { type: String, enum: ["ANY", "YES", "NO"], default: "ANY" },
      minimumStayMonths: { type: Number, min: 0, max: 120 },
    },
    amenities: [{ type: String, enum: PROPERTY_AMENITIES }],
    preferredLocations: [
      {
        city: { type: String, required: true, trim: true, maxlength: 80 },
        area: { type: String, required: true, trim: true, maxlength: 120 },
      },
    ],
    searchCenter: {
      type: { type: String, enum: ["Point"], default: "Point" },
      coordinates: {
        type: [Number],
        validate: {
          validator: (value) => !value?.length || (value.length === 2 && value.every(Number.isFinite)),
          message: "Search center must be [longitude, latitude]",
        },
      },
    },
    radiusKm: { type: Number, default: 5, min: 1, max: 100 },
    moveInDate: { type: Date, required: true, index: true },
    contact: { phoneVisibility: { type: String, enum: ["AFTER_LOGIN", "IN_APP_ONLY"], default: "IN_APP_ONLY" } },
    status: { type: String, enum: REQUEST_STATUSES, default: "DRAFT", index: true },
    moderation: {
      reason: { type: String, trim: true, maxlength: 1000 },
      reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      reviewedAt: Date,
    },
    expiresAt: { type: Date, index: true },
    stats: { views: { type: Number, default: 0 }, offers: { type: Number, default: 0 } },
    deletedAt: Date,
  },
  { timestamps: true, versionKey: false }
);

housingRequestSchema.index({ searchCenter: "2dsphere" }, { partialFilterExpression: { "searchCenter.coordinates.0": { $exists: true } } });
housingRequestSchema.index({ "translations.en.title": "text", "translations.en.description": "text", "translations.bn.title": "text", "translations.bn.description": "text", "preferredLocations.city": "text", "preferredLocations.area": "text" });
housingRequestSchema.index({ status: 1, kind: 1, category: 1, tenantType: 1, createdAt: -1 });

housingRequestSchema.pre("validate", function validateRequest(next) {
  const validCategory = this.kind === "RESIDENTIAL" ? RESIDENTIAL_CATEGORIES.includes(this.category) : COMMERCIAL_CATEGORIES.includes(this.category);
  if (!validCategory) return next(new Error(`Category ${this.category} is invalid for ${this.kind}`));
  if (this.budget.min > this.budget.max) return next(new Error("Budget minimum cannot exceed maximum"));
  return next();
});

module.exports = mongoose.model("HousingRequest", housingRequestSchema);
