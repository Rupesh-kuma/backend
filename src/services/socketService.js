/**
 * ChatIQ Socket Service v5
 * - Multi-language session state
 * - Step-by-step lead collection via chat
 * - Server-side validation
 */
const User        = require('../models/User');
const ChatSession = require('../models/ChatSession');
const Lead        = require('../models/Lead');
const aiService   = require('./aiService');
const trainingService = require('./trainingService');
const logger      = require('../utils/logger');

// per-socket state (in-memory, resets on reconnect)
const sessionState = new Map(); // sessionId → { lang, leadStep, leadData, leadCollected }

function getState(sessionId) {
  if (!sessionState.has(sessionId)) sessionState.set(sessionId, { lang: null, leadStep: null, leadData: {}, leadCollected: false });
  return sessionState.get(sessionId);
}

// Validators
function validateEmail(e) {
  if (!e) return 'Email required';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e.trim())) return 'Invalid email';
  const fake = ['test.com','fake.com','example.com','dummy.com'];
  if (fake.includes(e.split('@')[1]?.toLowerCase())) return 'Use a real email';
  return null;
}
function validatePhone(p) {
  if (!p || p.trim()==='' || /^(skip|no|nahi)$/i.test(p)) return null;
  const c = p.replace(/[\s\-().+]/g,'');
  if (!/^\d{7,15}$/.test(c)) return 'Invalid phone (7-15 digits)';
  return null;
}
function validateName(n) {
  if (!n || n.trim().length<2) return 'Name too short';
  if (/^\d+$/.test(n.trim())) return 'Name cannot be only numbers';
  return null;
}

function setupSocketHandlers(io) {
  io.on('connection', (socket) => {
    logger.debug('Socket: ' + socket.id);

    socket.on('join:dashboard', (userId) => { socket.join(`user:${userId}`); });

    // Widget init
    socket.on('widget:init', async ({ widgetId, sessionId, metadata }) => {
      try {
        const user = await User.findOne({ widgetId });
        if (!user) { socket.emit('widget:error', { message: 'Widget not found' }); return; }

        socket.join(`session:${sessionId}`);
        socket.widgetId  = widgetId;
        socket.sessionId = sessionId;
        socket.userId    = user._id.toString();

        let session = await ChatSession.findOne({ sessionId });
        if (!session) {
          session = await ChatSession.create({ widgetId, userId: user._id, sessionId, metadata: metadata || {} });
        }

        socket.emit('widget:ready', {
          botName:        user.widgetConfig.botName,
          welcomeMessage: user.widgetConfig.welcomeMessage,
          primaryColor:   user.widgetConfig.primaryColor,
          logoUrl:        user.widgetConfig.logoUrl,
          requireLeadInfo:user.widgetConfig.requireLeadInfo,
          hasKnowledge:   user.trainingStatus === 'trained',
          position:       user.widgetConfig.position || 'bottom-right'
        });
      } catch(e) {
        logger.error('widget:init: ' + e.message);
        socket.emit('widget:error', { message: 'Initialization failed' });
      }
    });

    // Old-style lead form (still supported)
    socket.on('widget:lead', async ({ sessionId, name, email, phone }) => {
      try {
        const ne = validateName(name), ee = validateEmail(email), pe = validatePhone(phone);
        if (ne) { socket.emit('widget:lead:error', { field:'name', msg:ne }); return; }
        if (ee) { socket.emit('widget:lead:error', { field:'email', msg:ee }); return; }
        if (pe) { socket.emit('widget:lead:error', { field:'phone', msg:pe }); return; }

        const session = await ChatSession.findOne({ sessionId });
        if (!session) return;
        await ChatSession.findOneAndUpdate({ sessionId }, { lead: { name:name.trim(), email:email.trim().toLowerCase(), phone:phone?.trim()||'', capturedAt:new Date() } });
        const existing = await Lead.findOne({ sessionId });
        if (!existing) {
          await Lead.create({ userId:session.userId, widgetId:session.widgetId, sessionId, name:name.trim(), email:email.trim().toLowerCase(), phone:phone?.trim()||'', metadata:session.metadata });
        }
        socket.emit('widget:lead:saved', { success: true });
      } catch(e) {
        logger.error('widget:lead: ' + e.message);
        socket.emit('widget:lead:error', { field:'general', msg:'Could not save. Try again.' });
      }
    });

    // Message handling with full state management
    socket.on('widget:message', async ({ sessionId, message }) => {
      try {
        if (!message || !message.trim()) return;
        // Internal init message — just trigger language selection, don't save to DB
        const isInit = message.trim() === '__init__';

        const session = await ChatSession.findOne({ sessionId }).lean();
        if (!session) { socket.emit('widget:error', { message:'Session not found' }); return; }

        const user = await User.findById(session.userId);
        if (!user) return;

        if (!isInit) {
          await ChatSession.findOneAndUpdate({ sessionId }, {
            $push: { messages: { role:'user', content:message.trim() } },
            updatedAt: new Date()
          });
        }

        socket.emit('widget:typing', { isTyping: true });

        const state = getState(sessionId);
        let responseText, action;

        try {
          const context = await trainingService.getRelevantContext(session.userId.toString(), message, 5);
          const history = (session.messages || []).slice(-8);

          const result = await aiService.generateResponse(
            message.trim(), context, user.widgetConfig.systemPrompt, history, state
          );
          responseText = result.text;
          action       = result.action;
        } catch(aiErr) {
          logger.error('AI: ' + aiErr.message);
          responseText = "Sorry, I encountered an issue. Please try again!";
          action = null;
        }

        // ── Handle action from AI ─────────────────────────────────────
        if (action) {
          if (action.type === 'set_lang') {
            state.lang = action.lang;
          }
          if (action.type === 'ask_lang') {
            // no state change, just asking
          }
          if (action.type === 'start_lead') {
            state.leadStep = 'name';
          }
          if (action.type === 'lead_step') {
            state.leadStep = action.step;
            if (action.name)  state.leadData.name  = action.name;
            if (action.email) state.leadData.email = action.email;
          }
          if (action.type === 'lead_complete') {
            if (action.phone) state.leadData.phone = action.phone;
            state.leadStep     = null;
            state.leadCollected= true;

            // Save lead to DB
            try {
              const existingLead = await Lead.findOne({ sessionId });
              if (!existingLead && state.leadData.name && state.leadData.email) {
                await Lead.create({
                  userId: session.userId,
                  widgetId: session.widgetId,
                  sessionId,
                  name:  state.leadData.name,
                  email: state.leadData.email,
                  phone: state.leadData.phone || '',
                  source: 'chat-conversation',
                  metadata: session.metadata
                });
                await ChatSession.findOneAndUpdate({ sessionId }, {
                  lead: { name: state.leadData.name, email: state.leadData.email, phone: state.leadData.phone||'', capturedAt: new Date() }
                });
                // Notify dashboard
                io.to(`user:${session.userId}`).emit('lead:new', {
                  name: state.leadData.name, email: state.leadData.email, sessionId
                });
              }
            } catch(le) { logger.error('Lead save: ' + le.message); }
          }
        }

        socket.emit('widget:typing', { isTyping: false });

        await ChatSession.findOneAndUpdate({ sessionId }, {
          $push: { messages: { role:'assistant', content:responseText } },
          updatedAt: new Date()
        });

        socket.emit('widget:response', {
          message: responseText,
          timestamp: new Date().toISOString(),
          action: action ? { type: action.type } : null  // only send type to client
        });

      } catch(e) {
        logger.error('widget:message: ' + e.message);
        socket.emit('widget:typing', { isTyping: false });
        socket.emit('widget:error', { message:'Message failed. Please try again.' });
      }
    });

    socket.on('disconnect', () => {
      logger.debug('Socket disconnect: ' + socket.id);
    });
  });

  return io;
}

module.exports = { setupSocketHandlers };
