const cron = require("node-cron");
const {config} = require("./config/env");
const logger = require("./config/logger");
const { expireListings } = require("./services/expiryService");
const { processNext } = require("./services/panoramaStitchService");
const {
  processPendingPushDeliveries,
  pruneStaleDeviceRegistrations,
  reconcileNotificationDeliveries,
  reconcileMessageNotifications,
} = require("./services/pushService");

const startScheduler = () => {
  const tasks = [];
  tasks.push(cron.schedule("*/15 * * * *", async () => {
    try {
      const result = await expireListings();
      if (result.properties || result.jobs || result.housingRequests || result.marketListings || result.notSureProperties) logger.info(result, "Listing lifecycle updated");
    } catch (error) {
      logger.error({ err: error }, "Listing expiry job failed");
    }
  }));

  tasks.push(cron.schedule("*/30 * * * * *", async () => {
    try {
      await processNext();
    } catch (error) {
      logger.error({ err: error }, "Panorama stitch job failed");
    }
  }));

  tasks.push(cron.schedule(`*/${Math.floor(Math.max(1, Math.min(59, config.push.workerIntervalSeconds)))} * * * * *`, async () => {
    try {
      await reconcileMessageNotifications();
      await reconcileNotificationDeliveries();
      await processPendingPushDeliveries();
    } catch (error) {
      logger.error({err: error}, "Push notification worker failed");
    }
  }));

  tasks.push(cron.schedule("17 3 * * *", async () => {
    try {
      const result = await pruneStaleDeviceRegistrations();
      if (result.modifiedCount) logger.info({disabledDevices: result.modifiedCount}, "Stale push devices disabled");
    } catch (error) {
      logger.error({err: error}, "Stale push device cleanup failed");
    }
  }));

  return {stop: () => tasks.forEach((task) => task.stop())};
};

module.exports = { startScheduler };
