const mongoose = require("mongoose");
const {config} = require("../src/config/env");
const CommentLike = require("../src/models/CommentLike");
const Property = require("../src/models/Property");
const PropertyComment = require("../src/models/PropertyComment");
const PropertyLike = require("../src/models/PropertyLike");

async function run() {
  await mongoose.connect(config.mongoUri);
  await Promise.all([
    PropertyLike.createIndexes(),
    PropertyComment.createIndexes(),
    CommentLike.createIndexes(),
    Property.updateMany({"stats.likes": {$exists: false}}, {$set: {"stats.likes": 0}}),
    Property.updateMany({"stats.comments": {$exists: false}}, {$set: {"stats.comments": 0}}),
  ]);
  const [likes, comments] = await Promise.all([
    PropertyLike.aggregate([{$group: {_id: "$propertyId", count: {$sum: 1}}}]),
    PropertyComment.aggregate([{$match: {deletedAt: null}}, {$group: {_id: "$propertyId", count: {$sum: 1}}}]),
  ]);
  const likeMap = new Map(likes.map((row) => [String(row._id), row.count]));
  const commentMap = new Map(comments.map((row) => [String(row._id), row.count]));
  const properties = await Property.find({}).select("_id").lean();
  if (properties.length) await Property.bulkWrite(properties.map((property) => ({
    updateOne: {
      filter: {_id: property._id},
      update: {$set: {
        "stats.likes": likeMap.get(String(property._id)) || 0,
        "stats.comments": commentMap.get(String(property._id)) || 0,
      }},
    },
  })));
  console.log("Property social indexes and counters are ready.");
  await mongoose.disconnect();
}

run().catch(async (error) => {
  console.error(error.message);
  await mongoose.disconnect();
  process.exitCode = 1;
});
