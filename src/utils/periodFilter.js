/** Build SQL date filter for employee activity periods (day / week / month). Uses APP timezone (IST default). */

const APP_TZ_OFFSET = process.env.APP_TZ_OFFSET || "+05:30";

function resolveMonth(month) {
  if (month && /^\d{4}-\d{2}$/.test(String(month))) return String(month);
  return null;
}

/** Current calendar date in app timezone (India by default). */
function sqlTodayDate() {
  return `DATE(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '${APP_TZ_OFFSET}'))`;
}

/**
 * @returns {{ clause: string, params: string[], label: string }}
 */
function buildPeriodDateFilter({
  period = "month",
  month = null,
  column = "COALESCE(started_at, created_at)",
  paramOffset = 3,
  clipWeekToMonth = false,
} = {}) {
  const p = String(period || "month").toLowerCase();
  const resolvedMonth = resolveMonth(month);
  const today = sqlTodayDate();
  const colDate = `DATE(${column})`;

  if (p === "day" || p === "today") {
    return {
      clause: `${colDate} = ${today}`,
      params: [],
      label: "Today",
      period: "day",
    };
  }

  if (p === "week" || p === "this_week") {
    const weekStart = `DATE_SUB(${today}, INTERVAL WEEKDAY(${today}) DAY)`;
    const rangeStart = clipWeekToMonth
      ? `GREATEST(${weekStart}, DATE_FORMAT(${today}, '%Y-%m-01'))`
      : weekStart;
    return {
      clause: `${colDate} >= ${rangeStart} AND ${colDate} <= ${today}`,
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
    clause: `DATE_FORMAT(${column}, '%Y-%m') = DATE_FORMAT(${today}, '%Y-%m')`,
    params: [],
    label: "This month",
    period: "month",
  };
}

module.exports = { buildPeriodDateFilter, resolveMonth, APP_TZ_OFFSET, sqlTodayDate };
