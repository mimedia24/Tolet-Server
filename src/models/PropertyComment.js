const mongoose = require("mongoose");

const propertyCommentSchema = new mongoose.Schema(
  {
    propertyId: {type: mongoose.Schema.Types.ObjectId, ref: "Property", required: true, index: true},
    authorId: {type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true},
    parentId: {type: mongoose.Schema.Types.ObjectId, ref: "PropertyComment", default: null, index: true},
    body: {type: String, trim: true, maxlength: 1000, required: true},
    editedAt: Date,
    deletedAt: Date,
    deletedBy: {type: mongoose.Schema.Types.ObjectId, ref: "User"},
    likeCount: {type: Number, default: 0, min: 0},
    replyCount: {type: Number, default: 0, min: 0},
  },
  {timestamps: true, versionKey: false},
);

propertyCommentSchema.index({propertyId: 1, parentId: 1, createdAt: -1, _id: -1});

module.exports = mongoose.model("PropertyComment", propertyCommentSchema);
