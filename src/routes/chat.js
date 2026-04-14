const express = require('express');
const { authenticate } = require('../middleware/auth');
const ChatSession = require('../models/ChatSession');

const router = express.Router();

// Get all chat sessions for dashboard
router.get('/sessions', authenticate, async (req, res) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const query = { userId: req.user._id };
    if (status) query.status = status;

    const sessions = await ChatSession.find(query)
      .sort({ updatedAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .lean();

    const total = await ChatSession.countDocuments(query);

    res.json({
      success: true,
      sessions,
      pagination: { total, page: parseInt(page), limit: parseInt(limit) }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get single session
router.get('/sessions/:sessionId', authenticate, async (req, res) => {
  try {
    const session = await ChatSession.findOne({
      sessionId: req.params.sessionId,
      userId: req.user._id
    });
    
    if (!session) {
      return res.status(404).json({ success: false, message: 'Session not found' });
    }
    
    res.json({ success: true, session });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// REST API fallback for chat (non-socket)
router.post('/message', async (req, res) => {
  try {
    const { widgetId, sessionId, message } = req.body;
    const aiService = require('../services/aiService');
    const trainingService = require('../services/trainingService');
    const User = require('../models/User');

    const user = await User.findOne({ widgetId });
    if (!user) return res.status(404).json({ success: false, message: 'Widget not found' });

    const context = await trainingService.getRelevantContext(user._id.toString(), message, 5);
    
    let session = await ChatSession.findOne({ sessionId });
    const conversationHistory = session ? session.messages.slice(-6) : [];

    const result = await aiService.generateResponse(
      message, context, user.widgetConfig.systemPrompt, conversationHistory
    );

    // Save to session
    if (session) {
      await ChatSession.findOneAndUpdate(
        { sessionId },
        { 
          $push: { 
            messages: 
              { role: 'user', content: message },
          }
        }
      );
      await ChatSession.findOneAndUpdate(
        { sessionId },
        { $push: { messages: { role: 'assistant', content: result.text } } }
      );
    }

    res.json({ success: true, response: result.text });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
