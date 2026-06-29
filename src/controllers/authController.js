const {
  findUserByLogin,
  findUserById,
  serializeUser,
  changePassword,
  ensureAdminUser,
  verifyPassword,
} = require("../services/userService");
const { signToken } = require("../utils/token");
const pool = require("../../config/db");

const login = async (req, res) => {
  try {
    const loginId = String(req.body?.loginId || req.body?.email || req.body?.username || "").trim();
    const password = String(req.body?.password || "");

    if (!loginId || !password) {
      return res.status(400).json({ success: false, message: "Login ID and password are required" });
    }

    const userRow = await findUserByLogin(loginId);
    if (!userRow || userRow.status !== "active") {
      return res.status(401).json({ success: false, message: "Invalid login ID or password" });
    }

    const valid = await verifyPassword(password, userRow.password_hash);
    if (!valid) {
      return res.status(401).json({ success: false, message: "Invalid login ID or password" });
    }

    await pool.query(`UPDATE users SET last_login_at = NOW() WHERE id = $1`, [userRow.id]);

    const user = serializeUser(userRow);
    const token = signToken({
      sub: userRow.id,
      role: userRow.role,
      employeeId: userRow.employee_id,
    });

    return res.json({
      success: true,
      token,
      user,
    });
  } catch (err) {
    console.error("Login error:", err);
    if (err.code === "ER_NO_SUCH_TABLE") {
      return res.status(503).json({
        success: false,
        message: "Users table missing — run backend/database/auth_schema.sql on MySQL",
      });
    }
    if (err.code === "ECONNREFUSED" || err.code === "ETIMEDOUT" || err.code === "ENOTFOUND") {
      return res.status(503).json({
        success: false,
        message: "Database unavailable — check DB_HOST and credentials on the server",
      });
    }
    return res.status(500).json({
      success: false,
      message: err.message || "Login failed",
    });
  }
};

const me = async (req, res) => {
  try {
    const userRow = await findUserById(req.user?.id);
    if (!userRow) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    return res.json({ success: true, user: serializeUser(userRow) });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

const changePasswordHandler = async (req, res) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ success: false, message: "Authentication required" });
    }
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Current password and new password are required",
      });
    }
    await changePassword(req.user.id, currentPassword, newPassword);
    const userRow = await findUserById(req.user.id);
    return res.json({ success: true, user: serializeUser(userRow) });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ success: false, message: err.message });
  }
};

const seedStatus = async (req, res) => {
  try {
    const result = await pool.query(`SELECT COUNT(*) AS c FROM users WHERE role = 'admin'`);
    const count = Number(result.rows[0]?.c || 0);
    return res.json({ success: true, hasAdmin: count > 0 });
  } catch {
    return res.json({ success: true, hasAdmin: false });
  }
};

const bootstrapAdmin = async (req, res) => {
  try {
    await ensureAdminUser();
    return res.json({ success: true, message: "Admin user ready" });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { login, me, changePasswordHandler, seedStatus, bootstrapAdmin };
