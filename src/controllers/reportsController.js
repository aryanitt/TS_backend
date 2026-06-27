const dataService = require("../services/dataService");

const getReportsDashboard = async (req, res) => {
  const bundle = await dataService.getReportsBundle();
  res.json({
    success: true,
    source: bundle.source,
    kpis: bundle.kpis,
    aiSummary: bundle.aiSummary,
    goalCompletion: {
      revenueTarget: { achieved: "1240k", target: "1500k", percentage: 83 },
      closedDeals: { achieved: 84, target: 120, percentage: 70 },
      qualifiedLeads: { achieved: 146, target: 180, percentage: 81 },
      customerNps: { score: 74, target: 80, percentage: 93 },
    },
  });
};

const getReportsAnalytics = async (req, res) => {
  const bundle = await dataService.getReportsBundle();
  res.json({
    success: true,
    source: bundle.source,
    revenueAnalytics: bundle.revenueAnalytics,
    leadSources: bundle.leadSources,
    conversionByStage: bundle.conversionByStage,
  });
};

const getTeamComparison = async (req, res) => {
  const bundle = await dataService.getReportsBundle();
  res.json({ success: true, team: bundle.team || [] });
};

module.exports = {
  getReportsDashboard,
  getReportsAnalytics,
  getTeamComparison,
};
