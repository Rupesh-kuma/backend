require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const connectDB = require('./utils/database');
const logger = require('./utils/logger');
const { setupSocketHandlers } = require('./services/socketService');

const authRoutes     = require('./routes/auth');
const widgetRoutes   = require('./routes/widget');
const trainingRoutes = require('./routes/training');
const chatRoutes     = require('./routes/chat');
const leadRoutes     = require('./routes/leads');
const dashboardRoutes= require('./routes/dashboard');
const inquiryRoutes  = require('./routes/inquiry');

const app    = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: '*', methods: ['GET','POST'], credentials: false },
  transports: ['websocket','polling']
});

connectDB();

// ── Security ────────────────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  crossOriginOpenerPolicy: false,
}));

app.use(cors({ origin: '*', credentials: false }));
app.use(morgan('combined', { stream: { write: m => logger.info(m.trim()) } }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Static uploads ──────────────────────────────────────────────────────────
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// ── Widget.js — with full CORS headers ─────────────────────────────────────
app.get('/widget.js', (req, res) => {
  res.setHeader('Content-Type',                'application/javascript');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cross-Origin-Resource-Policy','cross-origin');
  res.setHeader('Cache-Control',               'no-cache');
  const p = path.join(__dirname, '../public/widget.js');
  res.sendFile(p);
});

// ── Test page — served from backend so no CORS issues ──────────────────────
app.get('/test', (req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>ChatIQ Widget Test</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,sans-serif;background:#0f172a;color:#e2e8f0;min-height:100vh;display:flex;align-items:center;justify-content:center}
    .card{background:#1e293b;border:1px solid #334155;border-radius:20px;padding:40px;max-width:500px;width:90%;text-align:center}
    h1{font-size:28px;font-weight:800;margin-bottom:12px;background:linear-gradient(135deg,#6366f1,#8b5cf6);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
    p{color:#94a3b8;line-height:1.7;margin-bottom:8px}
    .badge{display:inline-block;background:#6366f1;color:#fff;border-radius:20px;padding:6px 16px;font-size:13px;font-weight:600;margin-top:16px}
    .dot{display:inline-block;width:8px;height:8px;background:#22c55e;border-radius:50%;margin-right:6px;animation:pulse 2s infinite}
    @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
  </style>
</head>
<body>
  <div class="card">
    <h1>ChatIQ Widget Test</h1>
    <p><span class="dot"></span>Backend is running on port 5000</p>
    <p style="margin-top:16px">Chat bubble should appear in the <strong style="color:#6366f1">bottom-right corner</strong> of this page.</p>
    <p style="margin-top:12px">Click it to start chatting with your AI!</p>
    <div class="badge">✓ Widget Loaded Successfully</div>
  </div>
  <script>
    window.AIChatConfig = {
      widgetId: '__WIDGET_ID__',
      serverUrl: 'http://localhost:5000'
    };
  </script>
  <script src="http://localhost:5000/widget.js"></script>
</body>
</html>`);
});

// ── Dynamic test page with actual widget ID ─────────────────────────────────
app.get('/test/:widgetId', (req, res) => {
  const widgetId = req.params.widgetId;
  res.setHeader('Content-Type', 'text/html');
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <title>ChatIQ Widget Test</title>
  <style>
    body{font-family:sans-serif;background:#0f172a;color:#e2e8f0;min-height:100vh;display:flex;align-items:center;justify-content:center}
    .card{background:#1e293b;border:1px solid #334155;border-radius:20px;padding:40px;max-width:480px;width:90%;text-align:center}
    h1{font-size:26px;font-weight:800;margin-bottom:12px;color:#6366f1}
    p{color:#94a3b8;line-height:1.7}
    code{background:#0f172a;padding:4px 10px;border-radius:6px;font-size:12px;color:#818cf8}
  </style>
</head>
<body>
  <div class="card">
    <h1>🤖 ChatIQ Widget</h1>
    <p>Widget ID: <code>${widgetId}</code></p>
    <p style="margin-top:16px">Chat bubble should be in the <strong style="color:#6366f1">bottom-right corner</strong>!</p>
  </div>
  <script>
    window.AIChatConfig = { widgetId: '${widgetId}', serverUrl: 'http://localhost:5000' };
  </script>
  <script src="http://localhost:5000/widget.js"></script>
</body>
</html>`);
});

// ── API routes ──────────────────────────────────────────────────────────────
app.set('io', io);
app.use('/api/auth',      authRoutes);
app.use('/api/widget',    widgetRoutes);
app.use('/api/training',  trainingRoutes);
app.use('/api/chat',      chatRoutes);
app.use('/api/leads',     leadRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/inquiry',  inquiryRoutes);

app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// Multer file upload errors
app.use((err, req, res, next) => {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ success: false, errors: { resume: 'File too large. Max 5MB.' } });
  }
  next(err);
});

// 404 handler
app.use((req, res) => res.status(404).json({ success: false, message: `Route ${req.path} not found` }));

// Error handler
app.use((err, req, res, next) => {
  logger.error(err.stack);
  res.status(err.status || 500).json({ success: false, message: err.message || 'Internal server error' });
});

setupSocketHandlers(io);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  logger.info(`🚀 Server running → http://localhost:${PORT}`);
  logger.info(`🧪 Test widget  → http://localhost:${PORT}/test`);
  logger.info(`🤖 AI Provider  → ${process.env.AI_PROVIDER || 'gemini'}`);
});

module.exports = { app, io };
