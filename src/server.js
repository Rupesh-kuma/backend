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

// Routes
const authRoutes      = require('./routes/auth');
const widgetRoutes    = require('./routes/widget');
const trainingRoutes  = require('./routes/training');
const chatRoutes      = require('./routes/chat');
const leadRoutes      = require('./routes/leads');
const dashboardRoutes = require('./routes/dashboard');

const app = express();
const server = http.createServer(app);

// ✅ Socket.io
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  transports: ['websocket', 'polling']
});

// ✅ Connect DB
connectDB();

// ✅ Middleware
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  crossOriginOpenerPolicy: false,
}));

app.use(cors({ origin: '*' }));
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ✅ socket access
app.set('io', io);

// ✅ Static
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// ===================================================
// 🔥 ROOT ROUTE (IMPORTANT FIX)
// ===================================================
app.get('/', (req, res) => {
  res.status(200).send(`
    <h1 style="text-align:center;margin-top:50px">
      🚀 ChatIQ Backend Live
    </h1>
    <p style="text-align:center">
      API is running successfully ✅
    </p>
  `);
});

// ===================================================
// ✅ HEALTH CHECK
// ===================================================
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date(),
    env: process.env.NODE_ENV
  });
});

// ===================================================
// ✅ WIDGET JS ROUTE
// ===================================================
app.get('/widget.js', (req, res) => {
  const filePath = path.join(__dirname, '../public/widget.js');

  res.setHeader('Content-Type', 'application/javascript');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

  res.sendFile(filePath, (err) => {
    if (err) {
      console.error("❌ widget.js not found:", err);
      res.status(404).send("Widget file not found");
    }
  });
});

// ===================================================
// ✅ TEST PAGE (WIDGET CHECK)
// ===================================================
app.get('/test/:widgetId?', (req, res) => {
  const wid = req.params.widgetId || "demo-widget";

  let serverUrl = process.env.WIDGET_SCRIPT_URL
    ? process.env.WIDGET_SCRIPT_URL.replace('/widget.js', '').replace(/\/$/, '')
    : 'https://ai-chat-widget-backend.onrender.com/';

  res.send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>ChatIQ Test</title>
  <style>
    body {
      background:#0f172a;
      color:#e2e8f0;
      font-family:sans-serif;
      display:flex;
      align-items:center;
      justify-content:center;
      min-height:100vh;
      margin:0
    }
    .card {
      background:#1e293b;
      border:1px solid #334155;
      border-radius:20px;
      padding:40px;
      max-width:480px;
      text-align:center
    }
    h1 {
      color:#6366f1;
      font-size:24px;
      margin-bottom:12px
    }
    p {
      color:#94a3b8;
      line-height:1.7
    }
  </style>
</head>

<body>
  <div class="card">
    <h1>🤖 ChatIQ Widget</h1>
    <p>Widget ID:<br/><b>${wid}</b></p>
    <p>Chat bubble should appear bottom-right</p>
  </div>

  <script>
    window.AIChatConfig = {
      widgetId: "${wid}",
      serverUrl: "${serverUrl}"
    };
  </script>

  <script src="${serverUrl}/widget.js"></script>
</body>
</html>`);
});

// ===================================================
// ✅ API ROUTES
// ===================================================
app.use('/api/auth', authRoutes);
app.use('/api/widget', widgetRoutes);
app.use('/api/training', trainingRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/leads', leadRoutes);
app.use('/api/dashboard', dashboardRoutes);

// ===================================================
// ❌ 404 HANDLER (LAST)
// ===================================================
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.path} not found`
  });
});

// ===================================================
// ❌ ERROR HANDLER
// ===================================================
app.use((err, req, res, next) => {
  console.error("❌ ERROR:", err);
  res.status(500).json({
    success: false,
    message: err.message || 'Server error'
  });
});

// ===================================================
// ✅ SOCKET INIT
// ===================================================
setupSocketHandlers(io);

// ===================================================
// ✅ SERVER START
// ===================================================
const PORT = process.env.PORT || 5000;

server.listen(PORT, '0.0.0.0', () => {
  logger.info(`🚀 Server running on port ${PORT}`);
  logger.info(`🌐 Live URL → https://ai-chat-widget-backend.onrender.com`);
  logger.info(`🧪 Test URL → https://ai-chat-widget-backend.onrender.com//test`);
  logger.info(`🤖 AI Provider → ${process.env.AI_PROVIDER || 'local'}`);
});