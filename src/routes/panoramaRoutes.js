const express = require("express");
const {
  attachToProperty,
  cancelSession,
  createSession,
  finalizeSession,
  getStatus,
  listMySessions,
  uploadFrame,
} = require("../controllers/panoramaController");
const { authenticate } = require("../middleware/auth");
const { panoramaFrameUploader } = require("../middleware/upload");
const validate = require("../middleware/validate");
const { panoramaSchemas } = require("../validators/schemas");

const router = express.Router();

router.use(authenticate);

router.get("/sessions", listMySessions);
router.post("/sessions", validate(panoramaSchemas.create), createSession);
router.get("/sessions/:id/status", validate(panoramaSchemas.byId), getStatus);
router.post("/sessions/:id/frames", panoramaFrameUploader.single("frame"), validate(panoramaSchemas.frame), uploadFrame);
router.post("/sessions/:id/finalize", validate(panoramaSchemas.finalize), finalizeSession);
router.delete("/sessions/:id", validate(panoramaSchemas.byId), cancelSession);
router.post("/sessions/:id/attach", validate(panoramaSchemas.attach), attachToProperty);

module.exports = router;
