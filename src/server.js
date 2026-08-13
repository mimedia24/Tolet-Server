const http = require("http");
const app = require("./app");
const { connectDatabase, disconnectDatabase } = require("./config/database");
const { config, validateProductionConfig } = require("./config/env");
const logger = require("./config/logger");
const { startScheduler } = require("./scheduler");
const { attachSocket } = require("./socket");

const start = async () => {
  validateProductionConfig();
  await connectDatabase();

  const server = http.createServer(app);
  const origins = config.corsOrigins.length ? config.corsOrigins : ["http://localhost:3000", "http://localhost:5173"];
  const io = attachSocket(server, app, origins);
  const scheduledTask = startScheduler();

  server.listen(config.port, () => logger.info({ port: config.port, environment: config.nodeEnv }, "To-Let API started"));

  const shutdown = async (signal) => {
    logger.info({ signal }, "Graceful shutdown started");
    scheduledTask.stop();
    io.close();
    server.close(async () => {
      await disconnectDatabase();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
};

start().catch((error) => {
  logger.fatal({ err: error }, "Server startup failed");
  process.exit(1);
});
