const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  widgetId: {
    type: String,
    unique: true,
    default: () => uuidv4()
  },
  plan: {
    type: String,
    enum: ['free', 'pro', 'enterprise'],
    default: 'free'
  },
  widgetConfig: {
    botName: { type: String, default: 'AI Assistant' },
    primaryColor: { type: String, default: '#6366f1' },
    logoUrl: { type: String, default: null },
    welcomeMessage: { type: String, default: 'Hi there! How can I help you today?' },
    systemPrompt: { type: String, default: 'You are a helpful AI assistant. Answer questions based only on the provided context from the website. If you cannot find the answer in the context, say "I don\'t have information about that. Please contact our support team."' },
    requireLeadInfo: { type: Boolean, default: true },
    offlineMessage: { type: String, default: 'We are currently offline. Leave a message and we\'ll get back to you!' },
    position: { type: String, enum: ['bottom-right', 'bottom-left'], default: 'bottom-right' }
  },
  trainingStatus: {
    type: String,
    enum: ['idle', 'crawling', 'processing', 'trained', 'error'],
    default: 'idle'
  },
  trainingProgress: { type: Number, default: 0 },
  trainedUrls: [String],
  totalChunks: { type: Number, default: 0 },
  lastTrainedAt: Date,
  createdAt: { type: Date, default: Date.now }
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Remove password from JSON output
userSchema.methods.toJSON = function() {
  const obj = this.toObject();
  delete obj.password;
  return obj;
};

module.exports = mongoose.model('User', userSchema);
