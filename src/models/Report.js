const mongoose = require("mongoose");
const { REPORT_REASONS, REPORT_STATUSES } = require("../constants/platform");

const reportSchema = new mongoose.Schema(
  {
    reporterId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    entityType: { type: String, enum: ["PROPERTY", "JOB", "USER", "MESSAGE"], required: true, index: true },
    entityId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    reason: { type: String, enum: REPORT_REASONS, required: true },
    details: { type: String, trim: true, maxlength: 2000, default: "" },
    status: { type: String, enum: REPORT_STATUSES, default: "OPEN", index: true },
    resolution: { type: String, trim: true, maxlength: 2000, default: "" },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    resolvedAt: Date,
  },
  { timestamps: true, versionKey: false }
);

reportSchema.index({ reporterId: 1, entityType: 1, entityId: 1 });

module.exports = mongoose.model("Report", reportSchema);
