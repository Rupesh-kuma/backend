/**
 * Inquiry Routes
 * Handles: contact forms, career forms, quote forms — all from external websites
 * POST /api/inquiry/submit/:widgetId  — public, called from client website
 * GET  /api/inquiry                   — dashboard, auth required
 */
const express  = require('express');
const multer   = require('multer');
const path     = require('path');
const fs       = require('fs');
const { authenticate } = require('../middleware/auth');
const Inquiry  = require('../models/Inquiry');
const User     = require('../models/User');

const router   = express.Router();

// ── File upload (resumes) ────────────────────────────────────────────────────
const uploadDir = path.join(__dirname, '../../uploads/resumes');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, uploadDir),
  filename:    (_, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, Date.now() + '_' + safe);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (_, file, cb) => {
    const allowed = ['.pdf','.doc','.docx'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('Only PDF, DOC, DOCX files allowed'));
  }
});

// ── Validators ───────────────────────────────────────────────────────────────
function validateEmail(email) {
  if (!email) return 'Email is required';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) return 'Invalid email address';
  const fake = ['test.com','fake.com','example.com','dummy.com','noemail.com'];
  if (fake.includes(email.split('@')[1]?.toLowerCase())) return 'Please use a real email';
  return null;
}
function validatePhone(phone) {
  if (!phone) return null;
  const c = phone.replace(/[\s\-().+]/g,'');
  if (!/^\d{7,15}$/.test(c)) return 'Invalid phone number (7-15 digits)';
  return null;
}
function validateName(name) {
  if (!name || name.trim().length < 2) return 'Name must be at least 2 characters';
  if (/^\d+$/.test(name.trim())) return 'Name cannot be only numbers';
  return null;
}

// ── PUBLIC: Submit form from any external website ────────────────────────────
router.post('/submit/:widgetId', upload.single('resume'), async (req, res) => {
  try {
    const { widgetId } = req.params;
    const user = await User.findOne({ widgetId });
    if (!user) return res.status(404).json({ success: false, message: 'Widget not found' });

    const body = req.body;
    const errors = {};

    // Validate common fields
    const nameErr  = validateName(body.name);
    const emailErr = validateEmail(body.email);
    const phoneErr = validatePhone(body.phone);
    if (nameErr)  errors.name  = nameErr;
    if (emailErr) errors.email = emailErr;
    if (phoneErr) errors.phone = phoneErr;

    // Career form: require position
    const formType = body.formType || 'inquiry';
    if (formType === 'career' && !body.position) {
      errors.position = 'Please select a position';
    }

    if (Object.keys(errors).length > 0) {
      return res.status(400).json({ success: false, errors });
    }

    // Build extra fields map (anything besides known fields)
    const knownKeys = new Set(['name','email','phone','message','position','formType','source']);
    const extraFields = {};
    for (const [k,v] of Object.entries(body)) {
      if (!knownKeys.has(k) && v) extraFields[k] = String(v);
    }

    const inquiry = await Inquiry.create({
      userId:    user._id,
      widgetId,
      formType,
      source:    body.source || req.headers.referer || 'website',
      name:      body.name?.trim(),
      email:     body.email?.trim().toLowerCase(),
      phone:     body.phone?.trim() || '',
      message:   body.message?.trim() || '',
      position:  body.position || '',
      resumeUrl: req.file ? `/uploads/resumes/${req.file.filename}` : '',
      fields:    extraFields,
      metadata: {
        userAgent: req.headers['user-agent'],
        ip:        req.ip,
        referrer:  req.headers.referer,
        page:      body.source
      }
    });

    // Notify dashboard via socket if available
    const io = req.app.get('io');
    if (io) {
      io.to(`user:${user._id}`).emit('inquiry:new', {
        id: inquiry._id, formType, name: body.name, email: body.email, createdAt: inquiry.createdAt
      });
    }

    res.json({ success: true, message: 'Submitted successfully!', id: inquiry._id });
  } catch (err) {
    if (err.message?.includes('Only PDF')) {
      return res.status(400).json({ success: false, errors: { resume: err.message } });
    }
    res.status(500).json({ success: false, message: 'Server error. Please try again.' });
  }
});

// ── DASHBOARD: Get all inquiries (auth) ──────────────────────────────────────
router.get('/', authenticate, async (req, res) => {
  try {
    const { page=1, limit=30, status, formType, search } = req.query;
    const query = { userId: req.user._id };
    if (status)   query.status   = status;
    if (formType) query.formType = formType;
    if (search) {
      query.$or = [
        { name:  { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { position: { $regex: search, $options: 'i' } }
      ];
    }

    const [inquiries, total] = await Promise.all([
      Inquiry.find(query).sort({ createdAt: -1 }).skip((page-1)*limit).limit(parseInt(limit)).lean(),
      Inquiry.countDocuments(query)
    ]);

    res.json({ success: true, inquiries, pagination: { total, page: parseInt(page), limit: parseInt(limit) } });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── DASHBOARD: Update status/notes ──────────────────────────────────────────
router.patch('/:id', authenticate, async (req, res) => {
  try {
    const inq = await Inquiry.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      { $set: { status: req.body.status, notes: req.body.notes } },
      { new: true }
    );
    if (!inq) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, inquiry: inq });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── DASHBOARD: Delete ────────────────────────────────────────────────────────
router.delete('/:id', authenticate, async (req, res) => {
  try {
    await Inquiry.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
    res.json({ success: true });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── Stats for dashboard ──────────────────────────────────────────────────────
router.get('/stats/summary', authenticate, async (req, res) => {
  try {
    const userId = req.user._id;
    const [total, byType, byStatus, recent] = await Promise.all([
      Inquiry.countDocuments({ userId }),
      Inquiry.aggregate([{ $match: { userId } }, { $group: { _id: '$formType', count: { $sum: 1 } } }]),
      Inquiry.aggregate([{ $match: { userId } }, { $group: { _id: '$status',   count: { $sum: 1 } } }]),
      Inquiry.find({ userId }).sort({ createdAt: -1 }).limit(5).lean()
    ]);
    res.json({ success: true, total, byType, byStatus, recent });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

module.exports = router;
