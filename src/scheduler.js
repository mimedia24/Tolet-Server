const cron = require("node-cron");
const logger = require("./config/logger");
const { expireListings } = require("./services/expiryService");

const startScheduler = () => {
  const task = cron.schedule("*/15 * * * *", async () => {
    try {
      const result = await expireListings();
      if (result.properties || result.jobs || result.housingRequests || result.notSureProperties) logger.info(result, "Listing lifecycle updated");
    } catch (error) {
      logger.error({ err: error }, "Listing expiry job failed");
    }
  });
  return task;
};

module.exports = { startScheduler };
