#!/usr/bin/env node
/**
 * One-time admin seed — run on Hostinger after creating the users table:
 *   node scripts/seed-admin.js
 */
require("dotenv").config({ quiet: true });

async function main() {
  const { ensureAdminUser } = require("../src/services/userService");
  await ensureAdminUser();
  console.log("Admin user ready.");
  console.log("Login ID:", process.env.ADMIN_LOGIN_ID || "ADMIN");
  console.log("Email:", (process.env.ADMIN_EMAIL || "admin@tspublication.in").toLowerCase());
  console.log("Password:", process.env.ADMIN_PASSWORD || "Admin@12345");
  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err.message || err);
  process.exit(1);
});
