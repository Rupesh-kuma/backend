const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  role: { type: String, enum: ['user', 'assistant'], required: true },
  content: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
  sources: [String]
});

const chatSessionSchema = new mongoose.Schema({
  widgetId: { type: String, required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  sessionId: { type: String, required: true, unique: true },
  lead: {
    name: String,
    email: String,
    phone: String,
    capturedAt: Date
  },
  messages: [messageSchema],
  status: { type: String, enum: ['active', 'closed'], default: 'active' },
  metadata: {
    userAgent: String,
    ip: String,
    referrer: String,
    page: String
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

chatSessionSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('ChatSession', chatSessionSchema);
