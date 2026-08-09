const express = require("express");
const router = express.Router();
const { listServices, createService, deleteService, distributeServiceLeadsNow } = require("../controllers/servicesController");

router.get("/", listServices);
router.post("/", createService);
router.delete("/:serviceId", deleteService);
router.post("/:serviceId/distribute", distributeServiceLeadsNow);

module.exports = router;
