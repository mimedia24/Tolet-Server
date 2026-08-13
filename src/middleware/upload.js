const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const { config } = require("../config/env");
const ApiError = require("../utils/ApiError");

fs.mkdirSync(config.uploadDir, { recursive: true });
fs.mkdirSync(config.kycUploadDir, { recursive: true });

const imageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const mediaTypes = new Set([...imageTypes, "model/gltf-binary", "model/gltf+json", "model/vnd.usdz+zip", "application/octet-stream"]);
const mediaExtensions = new Set([".jpg", ".jpeg", ".png", ".webp", ".glb", ".gltf", ".usdz"]);
const storage = multer.diskStorage({
  destination: (_req, _file, callback) => callback(null, config.uploadDir),
  filename: (_req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    callback(null, `${Date.now()}-${crypto.randomUUID()}${extension}`);
  },
});

const privateKycStorage = multer.diskStorage({
  destination: (_req, _file, callback) => callback(null, config.kycUploadDir),
  filename: (req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    callback(null, `${req.user._id}-${Date.now()}-${crypto.randomUUID()}${extension}`);
  },
});

const cameraStorage = multer.diskStorage({
  destination: (_req, _file, callback) => callback(null, config.uploadDir),
  filename: (req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    callback(null, `${req.user._id}-camera-${Date.now()}-${crypto.randomUUID()}${extension}`);
  },
});

const createUploader = (allowed, files, extensions) => multer({
  storage,
  limits: { fileSize: config.maxFileSizeBytes, files },
  fileFilter: (_req, file, callback) => {
    if (!allowed.has(file.mimetype) || (extensions && !extensions.has(path.extname(file.originalname).toLowerCase()))) return callback(new ApiError(400, "VALIDATION_ERROR", "The uploaded file type is not allowed"));
    return callback(null, true);
  },
});

const imageUploader = createUploader(imageTypes, config.maxFilesPerRequest);
const mediaUploader = createUploader(mediaTypes, 1, mediaExtensions);
const nidUploader = multer({ storage: privateKycStorage, limits: { fileSize: config.maxFileSizeBytes, files: 2 }, fileFilter: (_req, file, callback) => imageTypes.has(file.mimetype) ? callback(null, true) : callback(new ApiError(400, "VALIDATION_ERROR", "NID must be a JPEG, PNG or WebP image")) });
const cameraUploader = multer({ storage: cameraStorage, limits: { fileSize: config.maxFileSizeBytes, files: 1 }, fileFilter: (_req, file, callback) => imageTypes.has(file.mimetype) ? callback(null, true) : callback(new ApiError(400, "VALIDATION_ERROR", "Camera photo must be a JPEG, PNG or WebP image")) });

module.exports = { cameraUploader, imageUploader, mediaUploader, nidUploader };
