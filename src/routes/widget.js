const express = require('express');
const User = require('../models/User');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// Get widget config by widgetId (public - used by embedded widget)
router.get('/config/:widgetId', async (req, res) => {
  try {
    const user = await User.findOne({ widgetId: req.params.widgetId });
    if (!user) {
      return res.status(404).json({ success: false, message: 'Widget not found' });
    }

    res.json({
      success: true,
      config: {
        botName: user.widgetConfig.botName,
        primaryColor: user.widgetConfig.primaryColor,
        logoUrl: user.widgetConfig.logoUrl,
        welcomeMessage: user.widgetConfig.welcomeMessage,
        requireLeadInfo: user.widgetConfig.requireLeadInfo,
        offlineMessage: user.widgetConfig.offlineMessage,
        position: user.widgetConfig.position,
        hasKnowledge: user.trainingStatus === 'trained'
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get embed code snippet
router.get('/embed-code', authenticate, (req, res) => {
  const widgetUrl = process.env.WIDGET_SCRIPT_URL || 'https://ai-chat-widget-backend.onrender.com/widget.js';
  const embedCode = `<!-- AI Chat Widget -->
<script>
  window.AIChatConfig = { widgetId: '${req.user.widgetId}' };
</script>
<script src="${widgetUrl}" async></script>`;

  res.json({ success: true, embedCode, widgetId: req.user.widgetId });
});

module.exports = router;
