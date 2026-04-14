const express = require('express');
const { authenticate } = require('../middleware/auth');
const ChatSession = require('../models/ChatSession');
const Lead = require('../models/Lead');
const KnowledgeChunk = require('../models/KnowledgeChunk');

const router = express.Router();

router.get('/stats', authenticate, async (req, res) => {
  try {
    const userId = req.user._id;
    const now = new Date();
    const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);

    const [
      totalSessions,
      sessionsLast30Days,
      totalLeads,
      leadsLast7Days,
      totalChunks,
      recentSessions,
      recentLeads
    ] = await Promise.all([
      ChatSession.countDocuments({ userId }),
      ChatSession.countDocuments({ userId, createdAt: { $gte: thirtyDaysAgo } }),
      Lead.countDocuments({ userId }),
      Lead.countDocuments({ userId, createdAt: { $gte: sevenDaysAgo } }),
      KnowledgeChunk.countDocuments({ userId }),
      ChatSession.find({ userId }).sort({ createdAt: -1 }).limit(5).lean(),
      Lead.find({ userId }).sort({ createdAt: -1 }).limit(5).lean()
    ]);

    // Daily chat counts for last 7 days
    const dailyChats = await ChatSession.aggregate([
      {
        $match: {
          userId,
          createdAt: { $gte: sevenDaysAgo }
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    res.json({
      success: true,
      stats: {
        totalSessions,
        sessionsLast30Days,
        totalLeads,
        leadsLast7Days,
        totalChunks,
        trainingStatus: req.user.trainingStatus,
        lastTrainedAt: req.user.lastTrainedAt
      },
      recentSessions,
      recentLeads,
      dailyChats
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
