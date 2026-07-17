const express = require("express");
const router = express.Router();
const { listServices, createService, distributeServiceLeadsNow } = require("../controllers/servicesController");

router.get("/", listServices);
router.post("/", createService);
router.post("/:serviceId/distribute", distributeServiceLeadsNow);

module.exports = router;
