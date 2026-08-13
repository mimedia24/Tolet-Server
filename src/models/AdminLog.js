const mongoose = require("mongoose");

const adminLogSchema = new mongoose.Schema(
  {
    adminId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    action: { type: String, required: true, trim: true, maxlength: 100, index: true },
    entityType: { type: String, required: true, trim: true, maxlength: 50 },
    entityId: { type: mongoose.Schema.Types.ObjectId, index: true },
    before: mongoose.Schema.Types.Mixed,
    after: mongoose.Schema.Types.Mixed,
    metadata: mongoose.Schema.Types.Mixed,
    ip: String,
  },
  { timestamps: true, versionKey: false }
);

adminLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model("AdminLog", adminLogSchema);
