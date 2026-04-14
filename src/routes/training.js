const express = require('express');
const { authenticate } = require('../middleware/auth');
const trainingService = require('../services/trainingService');
const KnowledgeChunk = require('../models/KnowledgeChunk');
const User = require('../models/User');

const router = express.Router();

// ── Start website training ──────────────────────────────────────────────────
router.post('/start', authenticate, async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ success: false, message: 'URL is required' });

    try { new URL(url); } catch {
      return res.status(400).json({ success: false, message: 'Invalid URL format' });
    }

    const user = await User.findById(req.user._id);
    if (user.trainingStatus === 'crawling' || user.trainingStatus === 'processing') {
      return res.status(400).json({ success: false, message: 'Training already in progress' });
    }

    const io = req.app.get('io');
    trainingService.trainWebsite(req.user._id.toString(), url, io)
      .catch(err => console.error('Training error:', err));

    res.json({ success: true, message: 'Training started' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ── Manual text training (no crawling needed) ───────────────────────────────
router.post('/manual', authenticate, async (req, res) => {
  try {
    const { content, title } = req.body;
    if (!content || content.trim().length < 50) {
      return res.status(400).json({ success: false, message: 'Content too short (min 50 chars)' });
    }

    const embeddingService = require('../services/embeddingService');
    const crawlerService = require('../services/crawlerService');

    await User.findByIdAndUpdate(req.user._id, { trainingStatus: 'processing', trainingProgress: 10 });

    // Chunk the content
    const cleanContent = crawlerService.cleanText(content);
    const chunks = crawlerService.chunkText(cleanContent, 400, 40);

    // Delete old KB
    await KnowledgeChunk.deleteMany({ userId: req.user._id });

    // Generate embeddings and save
    const knowledgeChunks = [];
    for (let i = 0; i < chunks.length; i++) {
      const embedding = await embeddingService.generateEmbedding(chunks[i]);
      knowledgeChunks.push({
        userId: req.user._id,
        sourceUrl: 'manual-input',
        content: chunks[i],
        embedding,
        metadata: { title: title || 'Manual Content', chunkIndex: i, totalChunks: chunks.length }
      });

      const progress = 10 + Math.round(((i + 1) / chunks.length) * 85);
      await User.findByIdAndUpdate(req.user._id, { trainingProgress: progress });
    }

    await KnowledgeChunk.insertMany(knowledgeChunks);
    await User.findByIdAndUpdate(req.user._id, {
      trainingStatus: 'trained',
      trainingProgress: 100,
      totalChunks: knowledgeChunks.length,
      lastTrainedAt: new Date(),
      trainedUrls: ['manual-input']
    });

    res.json({ success: true, chunks: knowledgeChunks.length, message: 'Training complete!' });
  } catch (error) {
    await User.findByIdAndUpdate(req.user._id, { trainingStatus: 'error', trainingProgress: 0 });
    res.status(500).json({ success: false, message: error.message });
  }
});

// ── Get training status ─────────────────────────────────────────────────────
router.get('/status', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    res.json({
      success: true,
      status: user.trainingStatus,
      progress: user.trainingProgress,
      totalChunks: user.totalChunks,
      trainedUrls: user.trainedUrls,
      lastTrainedAt: user.lastTrainedAt
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ── Delete knowledge base ───────────────────────────────────────────────────
router.delete('/knowledge-base', authenticate, async (req, res) => {
  try {
    await trainingService.deleteKnowledgeBase(req.user._id.toString());
    res.json({ success: true, message: 'Knowledge base deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ── Get knowledge base info ─────────────────────────────────────────────────
router.get('/knowledge-base', authenticate, async (req, res) => {
  try {
    const count = await KnowledgeChunk.countDocuments({ userId: req.user._id });
    const sources = await KnowledgeChunk.distinct('sourceUrl', { userId: req.user._id });
    res.json({ success: true, totalChunks: count, sources: sources.length, sourceUrls: sources.slice(0, 20) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
