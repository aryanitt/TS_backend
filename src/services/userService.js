const pool = require("../../config/db");
const { hashPassword, verifyPassword, generateTempPassword } = require("../utils/password");

function normalizeLoginKey(value) {
  return String(value || "").trim().toLowerCase();
}

function buildLoginId(employeeRow, formEmpId) {
  const fromForm = String(formEmpId || employeeRow?.emp_id || "").trim();
  if (fromForm) {
    return fromForm.replace(/\s+/g, "-").toUpperCase().slice(0, 64);
  }
  return `EMP-${String(employeeRow.id).padStart(4, "0")}`;
}

async function findUserByLogin(loginId) {
  const key = normalizeLoginKey(loginId);
  const result = await pool.query(
    `SELECT u.*, e.name AS employee_name, e.department AS employee_department, e.role AS employee_role_title
     FROM users u
     LEFT JOIN employees e ON e.id = u.employee_id
     WHERE LOWER(u.login_id) = $1 OR LOWER(u.email) = $1
     LIMIT 1`,
    [key],
  );
  return result.rows[0] || null;
}

async function findUserById(id) {
  const result = await pool.query(
    `SELECT u.*, e.name AS employee_name, e.department AS employee_department, e.role AS employee_role_title
     FROM users u
     LEFT JOIN employees e ON e.id = u.employee_id
     WHERE u.id = $1 LIMIT 1`,
    [id],
  );
  return result.rows[0] || null;
}

async function createUserForEmployee(employee, options = {}) {
  const email = String(employee.email || "").trim().toLowerCase();
  if (!email) {
    const err = new Error("Employee email is required to create login credentials");
    err.statusCode = 400;
    throw err;
  }

  const loginId = buildLoginId(employee, options.empId);
  const tempPassword = options.password || generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);

  const existing = await pool.query(
    `SELECT id FROM users WHERE LOWER(login_id) = $1 OR LOWER(email) = $2 LIMIT 1`,
    [loginId.toLowerCase(), email],
  );
  if (existing.rows.length) {
    const err = new Error("Login ID or email already exists for another user");
    err.statusCode = 409;
    throw err;
  }

  const insert = await pool.query(
    `INSERT INTO users (login_id, email, password_hash, role, employee_id, status, must_change_password)
     VALUES ($1, $2, $3, 'employee', $4, 'active', 1)`,
    [loginId, email, passwordHash, employee.id],
  );

  const userId = insert.insertId || insert.rows?.[0]?.id;
  if (userId) {
    await pool.query(`UPDATE employees SET user_id = $1 WHERE id = $2`, [userId, employee.id]);
  }

  return {
    loginId,
    email,
    tempPassword,
    userId,
  };
}

async function deactivateUserForEmployee(employeeId) {
  await pool.query(
    `UPDATE users SET status = 'inactive', updated_at = NOW() WHERE employee_id = $1`,
    [employeeId],
  );
  await pool.query(
    `UPDATE employees SET status = 'inactive', updated_at = NOW() WHERE id = $1`,
    [employeeId],
  );
}

async function resetEmployeePassword(employeeId) {
  const userRes = await pool.query(
    `SELECT * FROM users WHERE employee_id = $1 AND role = 'employee' LIMIT 1`,
    [employeeId],
  );
  const user = userRes.rows[0];
  if (!user) {
    const err = new Error("No login account found for this employee");
    err.statusCode = 404;
    throw err;
  }
  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);
  await pool.query(
    `UPDATE users SET password_hash = $1, must_change_password = 1, status = 'active', updated_at = NOW() WHERE id = $2`,
    [passwordHash, user.id],
  );
  return {
    loginId: user.login_id,
    email: user.email,
    tempPassword,
  };
}

async function changePassword(userId, currentPassword, newPassword) {
  const user = await findUserById(userId);
  if (!user) {
    const err = new Error("User not found");
    err.statusCode = 404;
    throw err;
  }
  const ok = await verifyPassword(currentPassword, user.password_hash);
  if (!ok) {
    const err = new Error("Current password is incorrect");
    err.statusCode = 400;
    throw err;
  }
  if (String(newPassword).length < 6) {
    const err = new Error("New password must be at least 6 characters");
    err.statusCode = 400;
    throw err;
  }
  const passwordHash = await hashPassword(newPassword);
  await pool.query(
    `UPDATE users SET password_hash = $1, must_change_password = 0, updated_at = NOW() WHERE id = $2`,
    [passwordHash, userId],
  );
  return true;
}

async function ensureAdminUser() {
  const loginId = process.env.ADMIN_LOGIN_ID || "ADMIN";
  const email = (process.env.ADMIN_EMAIL || "admin@tspublication.in").toLowerCase();
  const plain = process.env.ADMIN_PASSWORD || "Admin@12345";

  const existing = await pool.query(
    `SELECT id FROM users WHERE role = 'admin' LIMIT 1`,
  );
  if (existing.rows.length) return;

  const passwordHash = await hashPassword(plain);
  await pool.query(
    `INSERT INTO users (login_id, email, password_hash, role, employee_id, status, must_change_password)
     VALUES ($1, $2, $3, 'admin', NULL, 'active', 1)`,
    [loginId, email, passwordHash],
  );
  console.log(`[auth] Seeded admin user login_id=${loginId} email=${email}`);
}

function serializeUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    loginId: row.login_id,
    email: row.email,
    role: row.role,
    employeeId: row.employee_id,
    status: row.status,
    mustChangePassword: Boolean(row.must_change_password),
    name: row.role === "employee" ? (row.employee_name || row.email) : "Admin",
    department: row.employee_department || null,
    employeeRole: row.employee_role_title || null,
  };
}

module.exports = {
  buildLoginId,
  findUserByLogin,
  findUserById,
  createUserForEmployee,
  deactivateUserForEmployee,
  resetEmployeePassword,
  changePassword,
  ensureAdminUser,
  verifyPassword,
  serializeUser,
};
