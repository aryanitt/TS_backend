const getDashboard = (req, res) => {
    res.json({
      profile: {
        name: "Alex",
        role: "Sales Manager",
        growth: "18.4%"
      },
  
      kpis: {
        revenue: "₹7.9L",
        cashCollected: "₹5.1L",
        conversionRate: "24%",
        qualifiedLeads: 721,
        pipelineValue: "₹12.4L"
      },
  
      insights: [
        "12 leads inactive for 7+ days",
        "3 negotiations stuck",
        "Conversion improved by 14%"
      ],
  
      metrics: {
        avgResponseTime: "2h",
        customerSatisfaction: "92%",
        meetingsScheduled: 48,
        tasksCompleted: 121
      },
  
      leaderboard: [
        {
          name: "Priya",
          sales: "₹2.4L"
        },
        {
          name: "Rahul",
          sales: "₹1.9L"
        },
        {
          name: "Aman",
          sales: "₹1.5L"
        }
      ],
  
      notifications: [
        "New lead assigned",
        "Meeting scheduled at 4 PM",
        "Target achieved for May"
      ],
  
      activity: [
        "Lead moved to negotiation",
        "Invoice generated",
        "Follow-up completed"
      ]
    });
  };
  
  const getRevenue = (req, res) => {
    res.json({
      revenue: [
        {
          month: "Jan",
          revenue: 120000,
          forecast: 100000
        },
        {
          month: "Feb",
          revenue: 180000,
          forecast: 160000
        },
        {
          month: "Mar",
          revenue: 240000,
          forecast: 210000
        },
        {
          month: "Apr",
          revenue: 310000,
          forecast: 280000
        },
        {
          month: "May",
          revenue: 390000,
          forecast: 350000
        },
        {
          month: "Jun",
          revenue: 460000,
          forecast: 420000
        }
      ]
    });
  };
  
  const getPipeline = (req, res) => {
    res.json({
      pipeline: [
        {
          stage: "New Leads",
          count: 120
        },
        {
          stage: "Qualified",
          count: 80
        },
        {
          stage: "Proposal",
          count: 42
        },
        {
          stage: "Closed",
          count: 19
        }
      ],
  
      serviceBreakdown: [
        {
          name: "POSH Training",
          revenue: 35
        },
        {
          name: "Compliance",
          revenue: 25
        },
        {
          name: "Corporate Training",
          revenue: 40
        }
      ]
    });
  };
  
  const getRecentLeads = (req, res) => {
    res.json({
      leads: [
        {
          id: 1,
          name: "Rohit Sharma",
          company: "Infosys",
          status: "Qualified",
          revenue: "₹1.2L"
        },
        {
          id: 2,
          name: "Neha Verma",
          company: "TCS",
          status: "Proposal Sent",
          revenue: "₹90K"
        },
        {
          id: 3,
          name: "Amit Singh",
          company: "Wipro",
          status: "Negotiation",
          revenue: "₹2.1L"
        }
      ]
    });
  };
  
  const getLeadById = (req, res) => {
    const { id } = req.params;
  
    res.json({
      id,
  
      company: "Infosys",
  
      contact: "Rohit Sharma",
  
      email: "rohit@infosys.com",
  
      phone: "+91 9876543210",
  
      revenue: "₹1.2L",
  
      stage: "Qualified",
  
      priority: "High",
  
      assignee: "Priya",
  
      followUp: "Tomorrow 4 PM",
  
      notes:
        "Client is interested in enterprise POSH training package. Waiting for final approval.",
  
      aiSuggestions: [
        "Send enterprise case study",
        "Schedule technical demo",
        "Follow up within 48 hours"
      ],
  
      timeline: [
        "Lead created",
        "Discovery call completed",
        "Proposal shared",
        "Follow-up pending"
      ]
    });
  };
  
  module.exports = {
    getDashboard,
    getRevenue,
    getPipeline,
    getRecentLeads,
    getLeadById
  };