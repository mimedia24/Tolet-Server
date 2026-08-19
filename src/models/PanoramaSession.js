const mongoose = require("mongoose");

const DEVICE_MODES = ["AR_DEPTH", "AR_TRACKING", "GYROSCOPE", "MANUAL"];
const CAPTURE_MODES = ["AUTO", "MANUAL"];
const SESSION_STATUSES = [
  "CAPTURING",
  "UPLOADING",
  "QUEUED",
  "PROCESSING",
  "READY",
  "FAILED",
  "CANCELLED",
  "ATTACHED",
];
const FAILURE_REASONS = [
  "INSUFFICIENT_OVERLAP",
  "MISSING_REGION",
  "FEATURE_MATCH_FAILURE",
  "EXCESSIVE_TRANSLATION",
  "LOW_QUALITY_FRAMES",
  "CAMERA_PARAMS_FAILURE",
  "CORRUPTED_IMAGE",
  "STITCHER_UNAVAILABLE",
  "TIMEOUT",
  "UNKNOWN",
];

const frameSchema = new mongoose.Schema(
  {
    frameId: { type: String, required: true, maxlength: 80 },
    filename: { type: String, required: true, maxlength: 200 },
    yaw: { type: Number, required: true, min: -360, max: 360 },
    pitch: { type: Number, required: true, min: -90, max: 90 },
    quality: { type: Number, min: 0, max: 1, default: 0.5 },
    fileSizeBytes: { type: Number, min: 0 },
    capturedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const panoramaSessionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    propertyId: { type: mongoose.Schema.Types.ObjectId, ref: "Property", index: true, sparse: true },
    status: { type: String, enum: SESSION_STATUSES, default: "CAPTURING", index: true },
    deviceMode: { type: String, enum: DEVICE_MODES, default: "GYROSCOPE" },
    captureMode: { type: String, enum: CAPTURE_MODES, default: "AUTO" },
    coverage: {
      overall: { type: Number, min: 0, max: 100, default: 0 },
      horizontal: { type: Number, min: 0, max: 100, default: 0 },
      upper: { type: Number, min: 0, max: 100, default: 0 },
      lower: { type: Number, min: 0, max: 100, default: 0 },
    },
    quality: {
      sharpness: { type: Number, min: 0, max: 1 },
      lighting: { type: Number, min: 0, max: 1 },
      overallGrade: { type: String, enum: ["POOR", "FAIR", "GOOD", "EXCELLENT"] },
    },
    frameCount: { type: Number, default: 0, min: 0 },
    frames: { type: [frameSchema], default: [] },
    processing: {
      attempts: { type: Number, default: 0, min: 0 },
      queuedAt: Date,
      startedAt: Date,
      completedAt: Date,
      failureReason: { type: String, enum: FAILURE_REASONS },
      failureMessage: { type: String, maxlength: 500 },
    },
    panorama: {
      masterUrl: { type: String, maxlength: 1000 },
      mobileUrl: { type: String, maxlength: 1000 },
      thumbnailUrl: { type: String, maxlength: 1000 },
      width: Number,
      height: Number,
      fileSizeBytes: Number,
    },
    expiresAt: { type: Date, index: { expireAfterSeconds: 0 } },
  },
  { timestamps: true, versionKey: false }
);

panoramaSessionSchema.index({ userId: 1, status: 1, updatedAt: -1 });
panoramaSessionSchema.index({ status: 1, "processing.queuedAt": 1 });

module.exports = mongoose.model("PanoramaSession", panoramaSessionSchema);
module.exports.DEVICE_MODES = DEVICE_MODES;
module.exports.CAPTURE_MODES = CAPTURE_MODES;
module.exports.SESSION_STATUSES = SESSION_STATUSES;
module.exports.FAILURE_REASONS = FAILURE_REASONS;
