const express  = require('express');
const jwt      = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const User     = require('../models/User');
const { authenticate } = require('../middleware/auth');
const multer   = require('multer');
const path     = require('path');
const fs       = require('fs');

const router = express.Router();

// ── Multer for logo upload ──────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../../uploads/logos');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => cb(null, `${req.user._id}_${Date.now()}${path.extname(file.originalname)}`)
});
const upload = multer({ storage, limits: { fileSize: 2 * 1024 * 1024 }, fileFilter: (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) cb(null, true);
  else cb(new Error('Only images allowed'));
}});

const genToken = (id) => jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });

// ── Register ────────────────────────────────────────────────────────────────
router.post('/register', [
  body('name').trim().isLength({ min: 2 }).withMessage('Name min 2 chars'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('password').isLength({ min: 6 }).withMessage('Password min 6 chars'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const { name, email, password } = req.body;
    if (await User.findOne({ email }))
      return res.status(400).json({ success: false, message: 'Email already registered' });

    const user = await User.create({ name, email, password });
    res.status(201).json({ success: true, token: genToken(user._id), user: user.toJSON() });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── Login ───────────────────────────────────────────────────────────────────
router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').exists(),
], async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user || !(await user.comparePassword(password)))
      return res.status(401).json({ success: false, message: 'Invalid email or password' });

    res.json({ success: true, token: genToken(user._id), user: user.toJSON() });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── Me ──────────────────────────────────────────────────────────────────────
router.get('/me', authenticate, (req, res) => res.json({ success: true, user: req.user.toJSON() }));

// ── Update widget config ────────────────────────────────────────────────────
router.put('/widget-config', authenticate, async (req, res) => {
  try {
    const allowed = ['botName','primaryColor','welcomeMessage','systemPrompt','requireLeadInfo','offlineMessage','position'];
    const updates = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) updates[`widgetConfig.${k}`] = req.body[k]; });
    if (req.body.name) updates.name = req.body.name;
    const user = await User.findByIdAndUpdate(req.user._id, updates, { new: true });
    res.json({ success: true, user: user.toJSON() });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── Upload logo ─────────────────────────────────────────────────────────────
router.post('/upload-logo', authenticate, upload.single('logo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
    const logoUrl = `/uploads/logos/${req.file.filename}`;
    await User.findByIdAndUpdate(req.user._id, { 'widgetConfig.logoUrl': logoUrl });
    res.json({ success: true, logoUrl });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── Change password ─────────────────────────────────────────────────────────
router.put('/change-password', authenticate, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword || newPassword.length < 6)
      return res.status(400).json({ success: false, message: 'Invalid password data' });

    const user = await User.findById(req.user._id);
    if (!(await user.comparePassword(currentPassword)))
      return res.status(401).json({ success: false, message: 'Current password is incorrect' });

    user.password = newPassword;
    await user.save();
    res.json({ success: true, message: 'Password changed successfully' });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

module.exports = router;
