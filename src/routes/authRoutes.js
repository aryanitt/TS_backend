const express = require("express");
const { login, me, changePasswordHandler, seedStatus, bootstrapAdmin } = require("../controllers/authController");
const { authenticate } = require("../middleware/auth");

const router = express.Router();

router.post("/login", login);
router.get("/seed-status", seedStatus);
router.post("/bootstrap-admin", bootstrapAdmin);
router.get("/me", authenticate, me);
router.post("/change-password", authenticate, changePasswordHandler);

module.exports = router;
