const dns = require("node:dns");
const mongoose = require("mongoose");
const { config } = require("./env");
const logger = require("./logger");

// Windows/ISP-এর SRV DNS resolution সমস্যা এড়াতে
dns.setServers(["1.1.1.1", "8.8.8.8"]);

mongoose.set("strictQuery", true);

const connectDatabase = async () => {
  await mongoose.connect(config.mongoUri, {
    autoIndex: !config.isProduction,
    maxPoolSize: 20,
    serverSelectionTimeoutMS: 10000,
  });

  logger.info("MongoDB connected");
};

const disconnectDatabase = async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
};

module.exports = {
  connectDatabase,
  disconnectDatabase,
};