const cron = require("node-cron");
const logger = require("./config/logger");
const { expireListings } = require("./services/expiryService");
const { processNext } = require("./services/panoramaStitchService");

const startScheduler = () => {
  cron.schedule("*/15 * * * *", async () => {
    try {
      const result = await expireListings();
      if (result.properties || result.jobs || result.housingRequests || result.notSureProperties) logger.info(result, "Listing lifecycle updated");
    } catch (error) {
      logger.error({ err: error }, "Listing expiry job failed");
    }
  });

  cron.schedule("*/30 * * * * *", async () => {
    try {
      await processNext();
    } catch (error) {
      logger.error({ err: error }, "Panorama stitch job failed");
    }
  });
};

module.exports = { startScheduler };
