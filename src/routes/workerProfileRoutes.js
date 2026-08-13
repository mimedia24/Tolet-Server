const express = require("express");
const { getMine, getOne, invite, list, listInvitations, saveMine, submitMine, updateInvitation } = require("../controllers/workerProfileController");
const { authenticate } = require("../middleware/auth");
const { requireCapability } = require("../middleware/authorize");
const feature = require("../middleware/feature");
const validate = require("../middleware/validate");
const { workerProfileSchemas } = require("../validators/schemas");

const router = express.Router();
router.use(feature("workerProfiles"));
router.get("/", list);
router.get("/me", authenticate, requireCapability("JOB_SEEKER"), getMine);
router.put("/me", authenticate, requireCapability("JOB_SEEKER"), validate(workerProfileSchemas.save), saveMine);
router.post("/me/submit", authenticate, requireCapability("JOB_SEEKER"), submitMine);
router.get("/invitations/me", authenticate, listInvitations);
router.patch("/invitations/:invitationId", authenticate, validate(workerProfileSchemas.invitationStatus), updateInvitation);
router.get("/:id", validate(workerProfileSchemas.byId), getOne);
router.post("/:id/hire", authenticate, requireCapability("EMPLOYER"), validate(workerProfileSchemas.invite), invite);

module.exports = router;
