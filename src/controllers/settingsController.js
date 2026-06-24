const getSettings = (req, res) => {
  res.json({
    profile: {
      fullName: "Alex Chen",
      role: "Super Admin",
      email: "alex.chen@tspublication.in",
      phone: "+91 98765 43210",
      timezone: "Asia/Kolkata (IST)",
    },

    auth: {
      provider: "google",
      passwordLoginEnabled: false,
      googleConnected: false,
      googleEmail: "",
    },

    notifications: {
      emailNotifications: true,
      leadAssigned: true,
      meetingReminder: true,
      targetAchieved: false,
      weeklyDigest: true,
    },

    appearance: {
      theme: "Crimson Noir",
      sidebarCollapsed: false,
    },

    integrations: [
      { id: 1, name: "Google Sign-In", connected: false, type: "auth" },
      { id: 2, name: "Google Calendar", connected: true, type: "calendar" },
      { id: 3, name: "Slack", connected: true, type: "messaging" },
    ],

    billing: {
      plan: "Enterprise",
      users: 48,
      renewalDate: "2026-01-01",
      monthlyCost: "₹41,500",
    },
  });
};

const updateSettings = (req, res) => {
  res.json({
    success: true,
    message: "Settings updated successfully",
  });
};

const connectGoogle = (req, res) => {
  res.json({
    success: true,
    message: "Google OAuth placeholder — wire /api/auth/google callback",
    auth: {
      provider: "google",
      googleConnected: true,
      googleEmail: req.body?.email || "alex.chen@gmail.com",
    },
  });
};

const disconnectGoogle = (req, res) => {
  res.json({
    success: true,
    message: "Google account disconnected",
    auth: {
      provider: "google",
      googleConnected: false,
      googleEmail: "",
    },
  });
};

module.exports = {
  getSettings,
  updateSettings,
  connectGoogle,
  disconnectGoogle,
};
