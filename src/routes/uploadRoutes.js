const express = require("express");
const { uploadCameraPhoto, uploadImages, uploadNidImages, uploadSpatialMedia } = require("../controllers/uploadController");
const { authenticate } = require("../middleware/auth");
const { cameraUploader, imageUploader, mediaUploader, nidUploader } = require("../middleware/upload");

const router = express.Router();
router.post("/images", authenticate, imageUploader.array("images"), uploadImages);
router.post("/spatial", authenticate, mediaUploader.single("media"), uploadSpatialMedia);
router.post("/kyc/nid", authenticate, nidUploader.array("nid", 2), uploadNidImages);
router.post("/camera-photo", authenticate, cameraUploader.single("photo"), uploadCameraPhoto);

module.exports = router;
