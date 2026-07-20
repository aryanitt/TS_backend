const express = require("express");
const { login, me, changePasswordHandler } = require("../controllers/authController");
const { googleCallback } = require("../controllers/googleController");
const { authenticate } = require("../middleware/auth");

const router = express.Router();

router.post("/login", login);
router.get("/google/callback", googleCallback);
router.get("/me", authenticate, me);
router.post("/change-password", authenticate, changePasswordHandler);

module.exports = router;
