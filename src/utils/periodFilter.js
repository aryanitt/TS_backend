/** Build SQL date filter for employee activity periods (day / week / month). */

function resolveMonth(month) {
  if (month && /^\d{4}-\d{2}$/.test(String(month))) return String(month);
  return null;
}

/**
 * @returns {{ clause: string, params: string[], label: string }}
 */
function buildPeriodDateFilter({
  period = "month",
  month = null,
  column = "COALESCE(started_at, created_at)",
  paramOffset = 3,
} = {}) {
  const p = String(period || "month").toLowerCase();
  const resolvedMonth = resolveMonth(month);

  if (p === "day" || p === "today") {
    return {
      clause: `DATE(${column}) = CURRENT_DATE()`,
      params: [],
      label: "Today",
      period: "day",
    };
  }

  if (p === "week" || p === "this_week") {
    return {
      clause: `DATE(${column}) >= DATE_SUB(CURRENT_DATE(), INTERVAL WEEKDAY(CURRENT_DATE()) DAY) AND DATE(${column}) <= CURRENT_DATE()`,
      params: [],
      label: "This week",
      period: "week",
    };
  }

  if (resolvedMonth) {
    return {
      clause: `DATE_FORMAT(${column}, '%Y-%m') = $${paramOffset}`,
      params: [resolvedMonth],
      label: resolvedMonth,
      period: "month",
    };
  }

  return {
    clause: `DATE_FORMAT(${column}, '%Y-%m') = DATE_FORMAT(CURRENT_DATE(), '%Y-%m')`,
    params: [],
    label: "This month",
    period: "month",
  };
}

module.exports = { buildPeriodDateFilter, resolveMonth };
