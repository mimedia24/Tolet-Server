const mongoose = require("mongoose");

const propertyCommentSchema = new mongoose.Schema(
  {
    propertyId: {type: mongoose.Schema.Types.ObjectId, ref: "Property", required: true, index: true},
    authorId: {type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true},
    clientCommentId: {type: String, trim: true, maxlength: 100},
    contentHash: {type: String, trim: true, maxlength: 64, select: false},
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
propertyCommentSchema.index(
  {authorId: 1, clientCommentId: 1},
  {unique: true, partialFilterExpression: {clientCommentId: {$type: "string"}}},
);

module.exports = mongoose.model("PropertyComment", propertyCommentSchema);
