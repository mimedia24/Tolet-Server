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
  console.log("Property social indexes and counters are ready.");
  await mongoose.disconnect();
}

run().catch(async (error) => {
  console.error(error.message);
  await mongoose.disconnect();
  process.exitCode = 1;
});
