const mongoose = require("mongoose");
const { HIRE_INVITATION_STATUSES } = require("../constants/platform");

const hireInvitationSchema = new mongoose.Schema(
  {
    workerProfileId: { type: mongoose.Schema.Types.ObjectId, ref: "WorkerProfile", required: true, index: true },
    workerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    employerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    jobId: { type: mongoose.Schema.Types.ObjectId, ref: "Job" },
    message: { type: String, trim: true, maxlength: 1500, default: "" },
    proposedSalary: { type: Number, min: 0 },
    status: { type: String, enum: HIRE_INVITATION_STATUSES, default: "SENT", index: true },
    statusHistory: [{ status: { type: String, enum: HIRE_INVITATION_STATUSES }, changedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, changedAt: { type: Date, default: Date.now } }],
  },
  { timestamps: true, versionKey: false }
);

hireInvitationSchema.index({ workerProfileId: 1, employerId: 1, jobId: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model("HireInvitation", hireInvitationSchema);
