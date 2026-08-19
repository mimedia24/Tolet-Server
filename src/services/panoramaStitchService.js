const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const { config } = require("../config/env");
const logger = require("../config/logger");
const PanoramaSession = require("../models/PanoramaSession");
const { createNotification } = require("./notificationService");
const stitcher = require("./panoramaStitchers/opencvStitcher");

// This module is a MongoDB-backed durable job queue: sessions atomically
// transition QUEUED -> PROCESSING via findOneAndUpdate (the update itself is
// the lock, so two workers can never claim the same session), then land on
// READY or FAILED. It intentionally mirrors the shape a Redis/BullMQ worker
// would have (claim -> process -> complete/fail -> retry) so swapping the
// queue backend later only touches this file, not the controllers.
let activeJobs = 0;

const STALE_PROCESSING_MS = 10 * 60 * 1000;

const recoverStaleJobs = async () => {
  const staleBefore = new Date(Date.now() - STALE_PROCESSING_MS);
  const stale = await PanoramaSession.find({ status: "PROCESSING", "processing.startedAt": { $lt: staleBefore } });
  for (const session of stale) {
    logger.warn({ sessionId: session._id }, "Recovering stale PROCESSING panorama session");
    session.status = session.processing.attempts >= config.panorama.maxAttempts ? "FAILED" : "QUEUED";
    if (session.status === "FAILED") {
      session.processing.failureReason = "TIMEOUT";
      session.processing.failureMessage = "Processing did not complete in time";
    }
    await session.save();
  }
};

const claimNext = async () => {
  const session = await PanoramaSession.findOneAndUpdate(
    { status: "QUEUED", "processing.attempts": { $lt: config.panorama.maxAttempts } },
    { $set: { status: "PROCESSING", "processing.startedAt": new Date() }, $inc: { "processing.attempts": 1 } },
    { sort: { "processing.queuedAt": 1 }, new: true }
  );
  return session;
};

const sessionDirFor = (sessionId) => path.join(config.panorama.sessionDir, String(sessionId));

const runStitcher = async (session) => {
  const sessionDir = sessionDirFor(session._id);
  const metaPath = path.join(sessionDir, "metadata.json");
  await fs.writeFile(metaPath, JSON.stringify({ frames: session.frames }), "utf8");

  const result = await stitcher.stitch(sessionDir);

  if (!result.success) {
    session.processing.failureReason = result.reason || "UNKNOWN";
    session.processing.failureMessage = String(result.message || "").slice(0, 500);
    session.status = session.processing.attempts >= config.panorama.maxAttempts ? "FAILED" : "QUEUED";
    await session.save();
    logger.warn({ sessionId: session._id, reason }, "Panorama stitching failed");
    return;
  }

  const publicDirName = crypto.randomUUID();
  const publicDir = path.join(config.panorama.panoramaDir, publicDirName);
  await fs.mkdir(publicDir, { recursive: true });

  const moves = [
    ["master", "panorama_master.jpg", `${publicDirName}/panorama_master.jpg`],
    ["mobile", "panorama_mobile.jpg", `${publicDirName}/panorama_mobile.jpg`],
    ["thumbnail", "thumbnail.jpg", `${publicDirName}/thumbnail.jpg`],
  ];
  for (const [key, filename, relativePath] of moves) {
    await fs.rename(result[key].path, path.join(config.panorama.panoramaDir, relativePath));
    result[key].url = `${config.publicBaseUrl}/uploads/panoramas/${relativePath}`;
  }

  session.status = "READY";
  session.panorama = {
    masterUrl: result.master.url,
    mobileUrl: result.mobile.url,
    thumbnailUrl: result.thumbnail.url,
    width: result.mobile.width,
    height: result.mobile.height,
    fileSizeBytes: result.mobile.fileSizeBytes,
  };
  session.processing.completedAt = new Date();
  session.processing.failureReason = undefined;
  session.processing.failureMessage = undefined;
  await session.save();

  await createNotification({
    userId: session.userId,
    type: "PANORAMA_READY",
    title: { en: "360 view ready", bn: "360° ভিউ প্রস্তুত" },
    body: { en: "Your 360 panorama has finished processing and is ready to preview.", bn: "আপনার 360° প্যানোরামা প্রস্তুত হয়েছে, এখন প্রিভিউ করতে পারবেন।" },
    data: { sessionId: String(session._id) },
  });

  logger.info({ sessionId: session._id }, "Panorama stitching completed");
};

const processNext = async () => {
  if (activeJobs >= config.panorama.maxConcurrentJobs) return;
  await recoverStaleJobs();
  const session = await claimNext();
  if (!session) return;
  activeJobs += 1;
  try {
    await runStitcher(session);
  } catch (error) {
    logger.error({ err: error, sessionId: session._id }, "Panorama stitching job threw unexpectedly");
    session.processing.failureReason = "UNKNOWN";
    session.processing.failureMessage = String(error.message || "").slice(0, 500);
    session.status = session.processing.attempts >= config.panorama.maxAttempts ? "FAILED" : "QUEUED";
    await session.save().catch(() => {});
  } finally {
    activeJobs -= 1;
  }
};

module.exports = { processNext, sessionDirFor };
