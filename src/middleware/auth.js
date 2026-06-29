const { verifyToken } = require("../utils/token");
const { findUserById, serializeUser } = require("../services/userService");

const PUBLIC_API_PREFIXES = [
  "/api/auth/login",
  "/api/auth/seed-status",
  "/api/auth/bootstrap-admin",
];

function isPublicApiPath(path) {
  return PUBLIC_API_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
}

function extractBearer(req) {
  const header = req.headers.authorization || "";
  if (header.startsWith("Bearer ")) return header.slice(7).trim();
  return req.headers["x-auth-token"] || null;
}

function applyUserToRequest(req, userRow) {
  const user = serializeUser(userRow);
  req.user = user;
  req.authUser = userRow;
  req.headers["x-tenant-id"] = req.headers["x-tenant-id"] || "default";
  req.headers["x-user-role"] = user.role;
  req.headers["x-user-name"] = user.name || user.email;
  req.headers["x-user-id"] = user.role === "employee"
    ? String(user.employeeId || user.id)
    : String(user.id);
}

function requestApiPath(req) {
  const fromOriginal = req.originalUrl?.split("?")[0];
  if (fromOriginal?.startsWith("/api")) return fromOriginal;
  const combined = `${req.baseUrl || ""}${req.path || ""}`;
  return combined.startsWith("/") ? combined : `/${combined}`;
}

async function authenticate(req, res, next) {
  const apiPath = requestApiPath(req);
  if (!apiPath.startsWith("/api")) return next();
  if (isPublicApiPath(apiPath)) return next();

  const token = extractBearer(req);
  if (!token) {
    return res.status(401).json({ success: false, message: "Authentication required" });
  }

  try {
    const payload = verifyToken(token);
    const userRow = await findUserById(payload.sub);
    if (!userRow || userRow.status !== "active") {
      return res.status(401).json({ success: false, message: "Invalid or inactive account" });
    }
    applyUserToRequest(req, userRow);
    return next();
  } catch {
    return res.status(401).json({ success: false, message: "Invalid or expired session" });
  }
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ success: false, message: "Admin access required" });
  }
  return next();
}

function requireEmployee(req, res, next) {
  if (req.user?.role !== "employee") {
    return res.status(403).json({ success: false, message: "Employee access required" });
  }
  return next();
}

module.exports = { authenticate, requireAdmin, requireEmployee, applyUserToRequest };
