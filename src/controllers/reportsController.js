const dataService = require("../services/dataService");

const getReportsDashboard = async (req, res) => {
  const bundle = await dataService.getReportsBundle();
  res.json({
    success: true,
    source: bundle.source,
    kpis: bundle.kpis,
    aiSummary: bundle.aiSummary,
    goalCompletion: {
      revenueTarget: { achieved: "0", target: "0", percentage: 0 },
      closedDeals: { achieved: 0, target: 0, percentage: 0 },
      qualifiedLeads: { achieved: 0, target: 0, percentage: 0 },
      customerNps: { score: 0, target: 0, percentage: 0 },
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
