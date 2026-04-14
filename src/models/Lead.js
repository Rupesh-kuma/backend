const mongoose = require('mongoose');

const leadSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  widgetId: { type: String, required: true },
  sessionId: { type: String, required: true },
  name: { type: String, required: true },
  email: { type: String, required: true },
  phone: String,
  status: { type: String, enum: ['new', 'contacted', 'converted', 'lost'], default: 'new' },
  source: { type: String, default: 'widget' },
  notes: String,
  metadata: {
    userAgent: String,
    ip: String,
    referrer: String,
    page: String
  },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Lead', leadSchema);
