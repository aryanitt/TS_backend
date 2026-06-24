const getIncentiveDashboard = (req, res) => {
    res.json({
      kpis: {
        totalPayouts: {
          value: "$62,220",
          growth: "+14.2%"
        },
  
        avgPerRep: {
          value: "$15,555",
          growth: "+8.1%"
        },
  
        topEarner: {
          name: "Alex",
          payout: "$22,740"
        },
  
        projectedQ3: {
          value: "$96k",
          growth: "+22%"
        }
      },
  
      trendData: [
        { month: "Jan", payout: 12000 },
        { month: "Feb", payout: 18000 },
        { month: "Mar", payout: 22000 },
        { month: "Apr", payout: 28000 },
        { month: "May", payout: 35000 },
        { month: "Jun", payout: 45000 }
      ],
  
      slabs: [
        {
          level: "Bronze",
          target: "₹50,000+",
          incentive: "5%"
        },
        {
          level: "Silver",
          target: "₹1,00,000+",
          incentive: "8%"
        },
        {
          level: "Gold",
          target: "₹2,00,000+",
          incentive: "12%"
        }
      ]
    });
  };
  
  const getLeaderboard = (req, res) => {
    res.json({
      leaderboard: [
        {
          rank: 1,
          name: "Alex",
          payout: "$22,740"
        },
        {
          rank: 2,
          name: "Priya",
          payout: "$18,200"
        },
        {
          rank: 3,
          name: "Rahul",
          payout: "$14,850"
        }
      ],
  
      payouts: [
        {
          id: 1,
          employee: "Alex",
          sales: "$210,000",
          incentive: "$22,740"
        },
        {
          id: 2,
          employee: "Priya",
          sales: "$180,000",
          incentive: "$18,200"
        },
        {
          id: 3,
          employee: "Rahul",
          sales: "$150,000",
          incentive: "$14,850"
        }
      ]
    });
  };
  
  const getCalculatorData = (req, res) => {
    res.json({
      slabs: [
        {
          level: "Bronze",
          incentive: "5%"
        },
        {
          level: "Silver",
          incentive: "8%"
        },
        {
          level: "Gold",
          incentive: "12%"
        }
      ],
  
      exampleCalculation: {
        salesAmount: 100000,
        slab: "Silver",
        incentive: 8000
      }
    });
  };
  
  module.exports = {
    getIncentiveDashboard,
    getLeaderboard,
    getCalculatorData
  };