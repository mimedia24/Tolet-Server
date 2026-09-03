const {connectDatabase, disconnectDatabase} = require("../src/config/database");
const logger = require("../src/config/logger");
const DeviceRegistration = require("../src/models/DeviceRegistration");
const Message = require("../src/models/Message");
const Notification = require("../src/models/Notification");
const PushDelivery = require("../src/models/PushDelivery");

const run = async () => {
  await connectDatabase();
  for (const Model of [DeviceRegistration, Message, Notification, PushDelivery]) {
    await Model.createIndexes();
    logger.info({collection: Model.collection.collectionName}, "Push notification indexes ready");
  }
};

run()
  .then(() => disconnectDatabase())
  .catch(async (error) => {
    logger.fatal({err: error}, "Push notification migration failed");
    await disconnectDatabase();
    process.exitCode = 1;
  });
