const express = require("express");
const router = express.Router();
const { listForms, createForm } = require("../controllers/formsController");

router.get("/", listForms);
router.post("/", createForm);

module.exports = router;
