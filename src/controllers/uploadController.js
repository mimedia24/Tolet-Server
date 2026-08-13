const path = require("path");
const { config } = require("../config/env");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const { success } = require("../utils/response");

const uploadImages = asyncHandler(async (req, res) => {
  const files = (req.files || []).map((file) => ({
    filename: file.filename,
    mimeType: file.mimetype,
    size: file.size,
    url: `${config.publicBaseUrl}/uploads/${encodeURIComponent(path.basename(file.filename))}`,
  }));
  return success(res, { status: 201, code: "FILES_UPLOADED", data: files });
});

const uploadSpatialMedia = asyncHandler(async (req, res) => {
  const file = req.file;
  if (!file) throw new ApiError(400, "VALIDATION_ERROR", "A spatial media file is required");
  const extension = path.extname(file.filename).toLowerCase();
  const type = [".glb", ".gltf", ".usdz"].includes(extension) ? "MODEL_3D" : "TOUR_360";
  return success(res, {
    status: 201,
    code: "FILE_UPLOADED",
    data: { filename: file.filename, mimeType: file.mimetype, size: file.size, type, url: `${config.publicBaseUrl}/uploads/${encodeURIComponent(path.basename(file.filename))}` },
  });
});

const uploadNidImages = asyncHandler(async (req, res) => {
  const files = req.files || [];
  if (files.length !== 2) throw new ApiError(400, "VALIDATION_ERROR", "NID front and back images are required");
  return success(res, { status: 201, code: "NID_FILES_UPLOADED", data: files.map((file) => ({ filename: path.basename(file.filename), mimeType: file.mimetype, size: file.size })) });
});

const uploadCameraPhoto = asyncHandler(async (req, res) => {
  if (!req.file) throw new ApiError(400, "VALIDATION_ERROR", "A live camera photo is required");
  const filename = path.basename(req.file.filename);
  return success(res, { status: 201, code: "CAMERA_PHOTO_UPLOADED", data: { filename, mimeType: req.file.mimetype, size: req.file.size, url: `${config.publicBaseUrl}/uploads/${encodeURIComponent(filename)}` } });
});

module.exports = { uploadCameraPhoto, uploadImages, uploadNidImages, uploadSpatialMedia };
