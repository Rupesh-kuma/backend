const mongoose = require('mongoose');

const inquirySchema = new mongoose.Schema({
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  widgetId:  { type: String, index: true },
  formType:  { type: String, enum: ['contact','career','inquiry','quote','booking','custom'], default: 'inquiry' },
  source:    { type: String, default: 'website' }, // which page/form

  // Common fields
  name:      { type: String },
  email:     { type: String },
  phone:     { type: String },
  message:   { type: String },

  // Career-specific
  position:  { type: String },
  resumeUrl: { type: String },

  // Extra key-value pairs from custom forms
  fields:    { type: Map, of: String, default: {} },

  status: { type: String, enum: ['new','reviewing','contacted','resolved','rejected'], default: 'new' },
  notes:  { type: String },
  metadata: {
    userAgent: String,
    ip:        String,
    referrer:  String,
    page:      String
  },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Inquiry', inquirySchema);
