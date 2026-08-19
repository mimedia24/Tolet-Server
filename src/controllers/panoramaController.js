const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");
const { config } = require("../config/env");
const PanoramaSession = require("../models/PanoramaSession");
const Property = require("../models/Property");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const { success } = require("../utils/response");
const { normalizeMediaUrl } = require("../utils/mediaUrl");
const { sessionDirFor } = require("../services/panoramaStitchService");

// JPEG (FF D8 FF), PNG (89 50 4E 47), WebP (RIFF....WEBP) magic-byte check.
// The client-declared mimetype/extension from a frame upload is not trusted;
// this is the actual gate against disguised or corrupted files reaching disk.
const detectImageExtension = (buffer) => {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return ".jpg";
  if (buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return ".png";
  if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") return ".webp";
  return null;
};

const findOwnedSession = async (id, userId) => {
  const session = await PanoramaSession.findOne({ _id: id, userId });
  if (!session) throw new ApiError(404, "NOT_FOUND");
  return session;
};

const serialize = (session) => ({
  sessionId: session._id,
  propertyId: session.propertyId || null,
  status: session.status,
  deviceMode: session.deviceMode,
  captureMode: session.captureMode,
  coverage: session.coverage,
  quality: session.quality,
  frameCount: session.frameCount,
  processing: {
    attempts: session.processing.attempts,
    queuedAt: session.processing.queuedAt,
    startedAt: session.processing.startedAt,
    completedAt: session.processing.completedAt,
    failureReason: session.processing.failureReason,
    failureMessage: session.processing.failureMessage,
  },
  panorama: session.panorama?.mobileUrl
    ? {
        masterUrl: normalizeMediaUrl(session.panorama.masterUrl),
        mobileUrl: normalizeMediaUrl(session.panorama.mobileUrl),
        thumbnailUrl: normalizeMediaUrl(session.panorama.thumbnailUrl),
        width: session.panorama.width,
        height: session.panorama.height,
      }
    : null,
  createdAt: session.createdAt,
  updatedAt: session.updatedAt,
});

const createSession = asyncHandler(async (req, res) => {
  const { deviceMode, captureMode } = req.validated.body;
  const session = await PanoramaSession.create({
    userId: req.user._id,
    deviceMode: deviceMode || "GYROSCOPE",
    captureMode: captureMode || "AUTO",
    status: "CAPTURING",
    expiresAt: new Date(Date.now() + config.panorama.draftTtlDays * 86400000),
  });
  await fs.mkdir(path.join(sessionDirFor(session._id), "frames"), { recursive: true });
  return success(res, { status: 201, code: "PANORAMA_SESSION_CREATED", data: serialize(session) });
});

const uploadFrame = asyncHandler(async (req, res) => {
  const session = await findOwnedSession(req.validated.params.id, req.user._id);
  if (!["CAPTURING", "UPLOADING"].includes(session.status)) throw new ApiError(409, "CONFLICT");
  if (!req.file) throw new ApiError(400, "VALIDATION_ERROR", "A frame image is required");
  if (session.frameCount >= config.panorama.maxFramesPerSession) throw new ApiError(400, "PANORAMA_LIMIT_REACHED");

  const extension = detectImageExtension(req.file.buffer);
  if (!extension) throw new ApiError(400, "VALIDATION_ERROR", "The uploaded frame is not a valid image file");

  const { frameId, yaw, pitch, quality } = req.validated.body;
  const filename = `${frameId}-${crypto.randomUUID()}${extension}`;
  const framesDir = path.join(sessionDirFor(session._id), "frames");
  await fs.mkdir(framesDir, { recursive: true });
  await fs.writeFile(path.join(framesDir, filename), req.file.buffer);

  session.frames.push({ frameId, filename, yaw, pitch, quality: quality ?? 0.5, fileSizeBytes: req.file.buffer.length, capturedAt: new Date() });
  session.frameCount = session.frames.length;
  await session.save();

  return success(res, { status: 201, code: "PANORAMA_FRAME_RECEIVED", data: { frameId, frameCount: session.frameCount } });
});

const finalizeSession = asyncHandler(async (req, res) => {
  const session = await findOwnedSession(req.validated.params.id, req.user._id);
  if (!["CAPTURING", "UPLOADING"].includes(session.status)) throw new ApiError(409, "CONFLICT");
  if (session.frameCount < config.panorama.minFramesToFinalize) throw new ApiError(400, "PANORAMA_NOT_ENOUGH_FRAMES");

  const { coverage, quality } = req.validated.body;
  session.coverage = coverage;
  if (quality) session.quality = { ...session.quality, ...quality };
  session.status = "QUEUED";
  session.processing.queuedAt = new Date();
  session.expiresAt = undefined;
  await session.save();

  return success(res, { code: "PANORAMA_FINALIZED", data: serialize(session) });
});

const getStatus = asyncHandler(async (req, res) => {
  const session = await findOwnedSession(req.validated.params.id, req.user._id);
  return success(res, { data: serialize(session) });
});

const listMySessions = asyncHandler(async (req, res) => {
  const sessions = await PanoramaSession.find({ userId: req.user._id, status: { $ne: "CANCELLED" } }).sort({ updatedAt: -1 }).limit(20);
  return success(res, { data: sessions.map(serialize) });
});

const cancelSession = asyncHandler(async (req, res) => {
  const session = await findOwnedSession(req.validated.params.id, req.user._id);
  if (["ATTACHED"].includes(session.status)) throw new ApiError(409, "CONFLICT");
  session.status = "CANCELLED";
  session.expiresAt = new Date(Date.now() + 60000);
  await session.save();
  return success(res, { code: "PANORAMA_CANCELLED" });
});

const attachToProperty = asyncHandler(async (req, res) => {
  const session = await findOwnedSession(req.validated.params.id, req.user._id);
  if (session.status !== "READY") throw new ApiError(409, "CONFLICT", "The panorama is not ready yet");

  const property = await Property.findOne({ _id: req.validated.body.propertyId, ownerId: req.user._id, deletedAt: null });
  if (!property) throw new ApiError(404, "NOT_FOUND");
  if (property.tour360Url) throw new ApiError(409, "PANORAMA_ALREADY_ATTACHED");

  const mobileUrl = normalizeMediaUrl(session.panorama.mobileUrl);
  property.tour360Url = mobileUrl;
  property.media = property.media.filter((item) => item.type !== "TOUR_360");
  if (property.media.length < 10) property.media.push({ type: "TOUR_360", url: mobileUrl, order: property.media.length });
  await property.save();

  session.propertyId = property._id;
  session.status = "ATTACHED";
  session.expiresAt = undefined;
  await session.save();

  return success(res, { code: "PANORAMA_ATTACHED", data: { propertyId: property._id, tour360Url: property.tour360Url } });
});

module.exports = { attachToProperty, cancelSession, createSession, finalizeSession, getStatus, listMySessions, uploadFrame };
