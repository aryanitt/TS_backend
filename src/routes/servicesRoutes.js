const express = require("express");
const router = express.Router();
const { listServices, createService } = require("../controllers/servicesController");

router.get("/", listServices);
router.post("/", createService);

module.exports = router;
