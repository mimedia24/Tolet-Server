const mongoose = require("mongoose");
const { APPLICATION_STATUSES } = require("../constants/platform");

const jobApplicationSchema = new mongoose.Schema(
  {
    jobId: { type: mongoose.Schema.Types.ObjectId, ref: "Job", required: true, index: true },
    applicantId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    employerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    applicantName: { type: String, required: true, trim: true, maxlength: 100 },
    phone: { type: String, required: true },
    experienceSummary: { type: String, trim: true, maxlength: 2000, default: "" },
    expectedAvailability: { type: Date, required: true },
    cvUrl: { type: String, trim: true, maxlength: 1000, default: "" },
    status: { type: String, enum: APPLICATION_STATUSES, default: "APPLIED", index: true },
    statusHistory: [
      {
        status: { type: String, enum: APPLICATION_STATUSES, required: true },
        changedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        changedAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true, versionKey: false }
);

jobApplicationSchema.index({ jobId: 1, applicantId: 1 }, { unique: true });

module.exports = mongoose.model("JobApplication", jobApplicationSchema);
