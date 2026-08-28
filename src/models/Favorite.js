const mongoose = require("mongoose");

const favoriteSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    entityType: { type: String, enum: ["PROPERTY", "JOB", "MARKET_LISTING"], required: true },
    entityId: { type: mongoose.Schema.Types.ObjectId, required: true },
  },
  { timestamps: true, versionKey: false }
);

favoriteSchema.index({ userId: 1, entityType: 1, entityId: 1 }, { unique: true });

module.exports = mongoose.model("Favorite", favoriteSchema);
