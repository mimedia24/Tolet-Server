const mongoose = require("mongoose");
const { JOB_CATEGORIES, JOB_STATUSES, JOB_TYPES } = require("../constants/platform");
const { DISTRICT_VALUES } = require("../constants/districts");
const { localizedContentSchema } = require("./shared");

const jobLocationSchema = new mongoose.Schema(
  {
    district: { type: String, enum: DISTRICT_VALUES, required: true, index: true },
    address: { type: String, trim: true, maxlength: 300, required: true },
    city: { type: String, trim: true, maxlength: 80, default: "" },
    area: { type: String, trim: true, maxlength: 120, default: "" },
    exactPublic: { type: Boolean, default: true },
    point: {
      type: { type: String, enum: ["Point"] },
      coordinates: { type: [Number], validate: [(value) => !value?.length || value.length === 2, "Coordinates must be [longitude, latitude]"] },
    },
  },
  { _id: false }
);

const jobSchema = new mongoose.Schema(
  {
    employerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    employerName: { type: String, required: true, trim: true, maxlength: 160 },
    category: { type: String, enum: JOB_CATEGORIES, required: true, index: true },
    translations: { type: localizedContentSchema, required: true },
    salary: {
      disclosed: { type: Boolean, default: false },
      type: { type: String, enum: ["FIXED", "RANGE"], required: true },
      amount: { type: Number, min: 0 },
      min: { type: Number, min: 0 },
      max: { type: Number, min: 0 },
      period: { type: String, enum: ["HOUR", "DAY", "MONTH", "CONTRACT"], default: "MONTH" },
      negotiable: { type: Boolean, default: false },
    },
    location: { type: jobLocationSchema, required: true },
    jobType: { type: String, enum: JOB_TYPES, required: true, index: true },
    personsNeeded: { type: Number, required: true, min: 1, max: 1000 },
    experience: {
      minimumYears: { type: Number, default: 0, min: 0, max: 80 },
      summary: { type: String, trim: true, maxlength: 1000 },
    },
    workingHours: { type: String, trim: true, maxlength: 300, required: true },
    benefits: [{ type: String, trim: true, maxlength: 100 }],
    applicationDeadline: { type: Date, required: true, index: true },
    contactMethod: { type: String, enum: ["IN_APP", "PHONE", "BOTH"], default: "IN_APP" },
    status: { type: String, enum: JOB_STATUSES, default: "DRAFT", index: true },
    moderation: {
      reason: { type: String, trim: true, maxlength: 1000 },
      reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      reviewedAt: Date,
    },
    expiresAt: { type: Date, index: true },
    stats: { views: { type: Number, default: 0 }, applications: { type: Number, default: 0 }, saves: { type: Number, default: 0 } },
    deletedAt: Date,
  },
  { timestamps: true, versionKey: false }
);

jobSchema.index({ "location.point": "2dsphere" });
jobSchema.index({ "translations.en.title": "text", "translations.en.description": "text", "translations.bn.title": "text", "translations.bn.description": "text", employerName: "text", "location.area": "text", "location.city": "text" });
jobSchema.index({ status: 1, category: 1, jobType: 1, createdAt: -1 });

jobSchema.pre("validate", function validateSalary(next) {
  if (!this.salary?.disclosed) return next();
  if (this.salary.type === "FIXED" && !Number.isFinite(this.salary.amount)) return next(new Error("Fixed salary amount is required"));
  if (this.salary.type === "RANGE" && (!Number.isFinite(this.salary.min) || !Number.isFinite(this.salary.max) || this.salary.min > this.salary.max)) {
    return next(new Error("Valid salary min/max range is required"));
  }
  return next();
});

module.exports = mongoose.model("Job", jobSchema);
