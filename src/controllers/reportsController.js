const getReportsDashboard = (req, res) => {
    res.json({
      kpis: {
        totalRevenue: {
          value: "$1.24M",
          growth: "+18.4%",
          comparison: "vs last month"
        },
  
        conversionRate: {
          value: "24.6%",
          growth: "+3.1%",
          comparison: "vs last month"
        },
  
        momGrowth: {
          value: "12.8%",
          growth: "+2.4%",
          comparison: "vs last month"
        },
  
        forecastQ3: {
          value: "$1.62M",
          growth: "+22%",
          comparison: "vs last month"
        }
      },
  
      aiSummary: [
        "Revenue increased by 18.4% compared to last month.",
        "Qualified leads conversion improved by 3.1%.",
        "Engineering sector generated highest revenue this quarter.",
        "Team is on track to achieve Q3 forecast targets."
      ],
  
      goalCompletion: {
        revenueTarget: {
          achieved: "1240k",
          target: "1500k",
          percentage: 83
        },
  
        closedDeals: {
          achieved: 84,
          target: 120,
          percentage: 70
        },
  
        qualifiedLeads: {
          achieved: 146,
          target: 180,
          percentage: 81
        },
  
        customerNps: {
          score: 74,
          target: 80,
          percentage: 93
        }
      }
    });
  };
  
  const getReportsAnalytics = (req, res) => {
    res.json({
      revenueAnalytics: [
        {
          month: "Jan",
          revenue: 120000
        },
        {
          month: "Feb",
          revenue: 180000
        },
        {
          month: "Mar",
          revenue: 240000
        },
        {
          month: "Apr",
          revenue: 310000
        },
        {
          month: "May",
          revenue: 390000
        },
        {
          month: "Jun",
          revenue: 460000
        }
      ],
  
      leadSources: [
        {
          source: "Website",
          leads: 340
        },
        {
          source: "LinkedIn",
          leads: 280
        },
        {
          source: "Facebook",
          leads: 190
        },
        {
          source: "Referral",
          leads: 110
        }
      ],
  
      conversionByStage: [
        {
          stage: "New Lead",
          count: 1200
        },
        {
          stage: "Qualified",
          count: 700
        },
        {
          stage: "Proposal",
          count: 320
        },
        {
          stage: "Negotiation",
          count: 180
        },
        {
          stage: "Won",
          count: 120
        }
      ]
    });
  };
  
  const getTeamComparison = (req, res) => {
    res.json({
      team: [
        {
          id: 1,
          name: "Priya Sharma",
          revenue: "₹2.4L",
          dealsClosed: 18,
          conversionRate: "28%"
        },
        {
          id: 2,
          name: "Rahul Verma",
          revenue: "₹1.9L",
          dealsClosed: 14,
          conversionRate: "24%"
        },
        {
          id: 3,
          name: "Aman Singh",
          revenue: "₹1.5L",
          dealsClosed: 11,
          conversionRate: "21%"
        }
      ]
    });
  };
  
  module.exports = {
    getReportsDashboard,
    getReportsAnalytics,
    getTeamComparison
  };