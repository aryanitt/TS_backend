const { logger } = require("../config/logger");

const BASE_URL = (process.env.CALLYZER_API_BASE_URL || "https://api1.callyzer.co/api/v2.1").replace(/\/$/, "");
const MIN_INTERVAL_MS = 2100;

let lastRequestAt = 0;
const historyCache = new Map();

function isConfigured() {
  return Boolean(process.env.CALLYZER_API_KEY?.trim());
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function throttle() {
  const elapsed = Date.now() - lastRequestAt;
  if (elapsed < MIN_INTERVAL_MS) {
    await sleep(MIN_INTERVAL_MS - elapsed);
  }
  lastRequestAt = Date.now();
}

async function callyzerPost(path, body = {}) {
  const key = process.env.CALLYZER_API_KEY?.trim();
  if (!key) {
    const err = new Error("Callyzer API key is not configured");
    err.status = 503;
    throw err;
  }

  await throttle();

  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { message: text };
  }

  if (!res.ok) {
    const err = new Error(payload.message || `Callyzer API error (${res.status})`);
    err.status = res.status;
    err.payload = payload;
    throw err;
  }

  return payload;
}

function digitsOnly(value) {
  return String(value || "").replace(/\D/g, "");
}

function normalizePhone(countryCode, number) {
  const num = digitsOnly(number);
  const cc = digitsOnly(countryCode);
  const full = cc && num ? `${cc}${num}` : num;
  return {
    full,
    last10: num.slice(-10),
    hyphen: cc && num ? `${cc}-${num}` : num,
  };
}

function phonesMatch(a, b) {
  if (!a || !b) return false;
  const da = digitsOnly(a);
  const db = digitsOnly(b);
  if (!da || !db) return false;
  if (da === db) return true;
  return da.slice(-10) === db.slice(-10);
}

/** Build Callyzer emp_numbers filter from CRM employee row. */
function employeeEmpNumbers(employee) {
  if (!employee) return [];

  const numbers = new Set();
  const callyser = employee.callyserId || employee.callyser_id;
  const phone = employee.phone;

  if (callyser) {
    const raw = String(callyser).trim();
    if (raw.includes("-")) {
      numbers.add(raw);
    } else {
      const d = digitsOnly(raw);
      if (d.length === 10) numbers.add(`91-${d}`);
      else if (d.length > 10) numbers.add(`${d.slice(0, d.length - 10)}-${d.slice(-10)}`);
      else numbers.add(raw);
    }
  }

  if (phone) {
    const d = digitsOnly(phone);
    if (d.length === 10) numbers.add(`91-${d}`);
    else if (d.length > 10) numbers.add(`${d.slice(0, d.length - 10)}-${d.slice(-10)}`);
  }

  const empCode = employee.empCode || employee.emp_id;
  if (empCode && !numbers.size) {
    numbers.add(String(empCode).trim());
  }

  return [...numbers].filter(Boolean);
}

function callTypeToDirection(callType) {
  const t = String(callType || "").toLowerCase();
  if (t === "incoming" || t === "missed") return "inbound";
  return "outbound";
}

function callTypeToOutcome(callType, duration) {
  const t = String(callType || "").toLowerCase();
  const dur = Number(duration) || 0;
  if (t === "missed") return "Missed";
  if (t === "rejected") return "Rejected";
  if (dur <= 2) return "Not connected";
  return "Connected";
}

function parseCallyzerTimestamp(callDate, callTime) {
  if (!callDate) return null;
  const time = callTime || "00:00:00";
  const iso = `${callDate}T${time}`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function mapLogToCall(log, employeeId, leadId) {
  const startedAt = parseCallyzerTimestamp(log.call_date, log.call_time);
  const durationSec = Number(log.duration) || 0;
  const endedAt = startedAt && durationSec
    ? new Date(new Date(startedAt).getTime() + durationSec * 1000).toISOString()
    : startedAt;

  return {
    id: `cz-${log.id}`,
    tenantId: null,
    leadId: leadId || null,
    employeeId,
    direction: callTypeToDirection(log.call_type),
    outcome: callTypeToOutcome(log.call_type, durationSec),
    durationSec,
    startedAt,
    endedAt,
    sopId: null,
    checklistProgress: [],
    recordingUrl: log.call_recording_url || null,
    transcript: null,
    notes: log.note || null,
    aiSummary: log.note || null,
    createdAt: log.synced_at || startedAt,
    source: "callyzer",
    callyzerCallId: log.id,
    clientName: log.client_name || null,
    clientPhone: normalizePhone(log.client_country_code, log.client_number).full || null,
  };
}

function findLeadForClient(leads, clientCountryCode, clientNumber) {
  if (!Array.isArray(leads) || !clientNumber) return null;
  const client = normalizePhone(clientCountryCode, clientNumber);
  return leads.find((lead) => {
    const leadPhone = digitsOnly(lead.phone);
    if (!leadPhone) return false;
    return phonesMatch(leadPhone, client.full) || phonesMatch(leadPhone, client.last10);
  }) || null;
}

function employeeMatchesWebhook(employee, payload) {
  if (!employee) return false;
  const callyser = String(employee.callyserId || employee.callyser_id || "").trim();
  const empCode = String(employee.empCode || employee.emp_id || "").trim();
  const payloadCode = String(payload.emp_code || "").trim();
  const payloadNumber = normalizePhone(payload.emp_country_code, payload.emp_number);

  if (callyser && payloadCode && callyser === payloadCode) return true;
  if (empCode && payloadCode && empCode === payloadCode) return true;

  if (callyser && callyser.includes("-") && payloadNumber.hyphen === callyser) return true;
  if (employee.phone && phonesMatch(employee.phone, payloadNumber.full)) return true;

  const callyserDigits = digitsOnly(callyser);
  if (callyserDigits && phonesMatch(callyserDigits, payloadNumber.full)) return true;

  return false;
}

async function fetchCallHistory({ empNumbers, days = 30, pageSize = 100 }) {
  if (!empNumbers?.length) return [];

  const cacheKey = `${empNumbers.sort().join(",")}:${days}`;
  const cached = historyCache.get(cacheKey);
  if (cached && Date.now() - cached.at < 120000) {
    return cached.logs;
  }

  const callTo = Math.floor(Date.now() / 1000);
  const callFrom = callTo - Math.min(Number(days) || 30, 90) * 86400;

  const allLogs = [];
  let pageNo = 1;
  let totalRecords = Infinity;

  while (allLogs.length < totalRecords && pageNo <= 5) {
    const response = await callyzerPost("/call-log/history", {
      call_from: callFrom,
      call_to: callTo,
      emp_numbers: empNumbers,
      page_no: pageNo,
      page_size: Math.min(pageSize, 100),
    });

    const batch = Array.isArray(response.result) ? response.result : [];
    totalRecords = Number(response.total_records) || batch.length;
    allLogs.push(...batch);

    if (batch.length < Math.min(pageSize, 100)) break;
    pageNo += 1;
  }

  historyCache.set(cacheKey, { at: Date.now(), logs: allLogs });
  return allLogs;
}

async function getCallsForEmployee(tenantId, employee, { dbCalls = [], leads = [], days = 30 } = {}) {
  if (!isConfigured() || !employee) return dbCalls;

  const empNumbers = employeeEmpNumbers(employee);
  if (!empNumbers.length) {
    logger.warn("Callyzer: employee has no callyser_id or phone mapped", { employeeId: employee.id });
    return dbCalls;
  }

  try {
    const logs = await fetchCallHistory({ empNumbers, days });
    const dbCallyzerIds = new Set(
      dbCalls.map((c) => c.callyzerCallId).filter(Boolean),
    );

    const callyzerCalls = logs
      .filter((log) => log?.id && !dbCallyzerIds.has(log.id))
      .map((log) => {
        const lead = findLeadForClient(leads, log.client_country_code, log.client_number);
        return mapLogToCall(log, employee.id, lead?.id);
      });

    const merged = [...dbCalls, ...callyzerCalls];
    merged.sort((a, b) => {
      const ta = new Date(a.startedAt || a.createdAt || 0).getTime();
      const tb = new Date(b.startedAt || b.createdAt || 0).getTime();
      return tb - ta;
    });
    return merged.slice(0, 200);
  } catch (err) {
    logger.error("Callyzer call fetch failed", { employeeId: employee.id, message: err.message });
    return dbCalls;
  }
}

function verifyWebhookSecret(req) {
  const expected = process.env.CALLYZER_WEBHOOK_SECRET?.trim();
  if (!expected) return true;

  const provided = (
    req.headers["x-callyzer-secret"]
    || req.headers["x-webhook-secret"]
    || req.headers.secret
    || req.query?.secret
    || ""
  ).toString().trim();

  return provided && provided === expected;
}

module.exports = {
  isConfigured,
  callyzerPost,
  employeeEmpNumbers,
  normalizePhone,
  phonesMatch,
  mapLogToCall,
  findLeadForClient,
  employeeMatchesWebhook,
  fetchCallHistory,
  getCallsForEmployee,
  verifyWebhookSecret,
};
