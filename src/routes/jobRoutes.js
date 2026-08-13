const express = require("express");
const {
  apply,
  createJob,
  deleteJob,
  getApplicants,
  getContact,
  getJob,
  getMyApplications,
  getMyJobs,
  listJobs,
  submitJob,
  updateApplicationStatus,
  updateJob,
  updateOwnerStatus,
  withdrawApplication,
} = require("../controllers/jobController");
const { authenticate, optionalAuthenticate } = require("../middleware/auth");
const { requireCapability } = require("../middleware/authorize");
const validate = require("../middleware/validate");
const { jobSchemas } = require("../validators/schemas");

const router = express.Router();

router.get("/", listJobs);
router.get("/me/posts", authenticate, requireCapability("EMPLOYER"), getMyJobs);
router.get("/me/applications", authenticate, requireCapability("JOB_SEEKER"), getMyApplications);
router.patch("/applications/:applicationId", authenticate, requireCapability("EMPLOYER"), validate(jobSchemas.applicationStatus), updateApplicationStatus);
router.post("/applications/:applicationId/withdraw", authenticate, requireCapability("JOB_SEEKER"), withdrawApplication);
router.post("/", authenticate, requireCapability("EMPLOYER"), validate(jobSchemas.create), createJob);
router.get("/:id", optionalAuthenticate, validate(jobSchemas.byId), getJob);
router.patch("/:id", authenticate, requireCapability("EMPLOYER"), validate(jobSchemas.update), updateJob);
router.delete("/:id", authenticate, requireCapability("EMPLOYER"), validate(jobSchemas.byId), deleteJob);
router.post("/:id/submit", authenticate, requireCapability("EMPLOYER"), validate(jobSchemas.byId), submitJob);
router.patch("/:id/status", authenticate, requireCapability("EMPLOYER"), validate(jobSchemas.ownerStatus), updateOwnerStatus);
router.post("/:id/apply", authenticate, requireCapability("JOB_SEEKER"), validate(jobSchemas.apply), apply);
router.get("/:id/applicants", authenticate, requireCapability("EMPLOYER"), getApplicants);
router.post("/:id/contact", authenticate, getContact);

module.exports = router;
