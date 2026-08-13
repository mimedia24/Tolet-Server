const mongoose = require("mongoose");
const { JOB_CATEGORIES, WORKER_PROFILE_STATUSES } = require("../constants/platform");
const { DISTRICT_VALUES } = require("../constants/districts");

const workerProfileSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true, index: true },
    categories: { type: [{ type: String, enum: JOB_CATEGORIES }], required: true },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    bio: { type: String, required: true, trim: true, maxlength: 2000 },
    experienceYears: { type: Number, min: 0, max: 80, default: 0 },
    skills: [{ type: String, trim: true, maxlength: 80 }],
    expectedSalary: { min: { type: Number, min: 0 }, max: { type: Number, min: 0 }, period: { type: String, enum: ["DAY", "MONTH", "CONTRACT"], default: "MONTH" } },
    workMode: { type: String, enum: ["LIVE_IN", "LIVE_OUT", "BOTH"], default: "BOTH" },
    jobType: { type: String, enum: ["FULL_TIME", "PART_TIME", "CONTRACT", "DAILY"], default: "CONTRACT", index: true },
    availability: { type: String, enum: ["AVAILABLE_NOW", "AVAILABLE_FROM_DATE", "NOT_AVAILABLE"], default: "AVAILABLE_NOW" },
    availableFrom: Date,
    serviceAreas: [{ district: { type: String, enum: DISTRICT_VALUES, required: true }, city: { type: String, trim: true, maxlength: 80 }, area: { type: String, trim: true, maxlength: 120 } }],
    location: {
      type: { type: String, enum: ["Point"], default: "Point" },
      coordinates: { type: [Number], validate: [(value) => value.length === 0 || value.length === 2, "Coordinates must be [longitude, latitude]"] },
    },
    status: { type: String, enum: WORKER_PROFILE_STATUSES, default: "DRAFT", index: true },
    moderation: { reason: { type: String, trim: true, maxlength: 1000 }, reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, reviewedAt: Date },
    stats: { views: { type: Number, default: 0 }, invitations: { type: Number, default: 0 }, hires: { type: Number, default: 0 } },
    deletedAt: Date,
  },
  { timestamps: true, versionKey: false }
);

workerProfileSchema.index({ location: "2dsphere" }, { sparse: true });
workerProfileSchema.index({ status: 1, categories: 1, createdAt: -1 });
workerProfileSchema.index({ status: 1, "serviceAreas.district": 1, createdAt: -1 });
workerProfileSchema.index({ title: "text", bio: "text", skills: "text", "serviceAreas.city": "text", "serviceAreas.area": "text" });

module.exports = mongoose.model("WorkerProfile", workerProfileSchema);
