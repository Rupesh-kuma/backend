const User           = require('../models/User');
const KnowledgeChunk = require('../models/KnowledgeChunk');
const crawlerService = require('./crawlerService');
const embeddingService = require('./embeddingService');
const logger         = require('../utils/logger');

class TrainingService {
  async trainWebsite(userId, url, io = null) {
    const emit = (status, progress, message, extra = {}) => {
      if (io) io.to(`user:${userId}`).emit('training:update', { status, progress, message, ...extra });
    };

    try {
      await User.findByIdAndUpdate(userId, { trainingStatus: 'crawling', trainingProgress: 0 });
      emit('crawling', 5, '🕷️ Starting website crawl...');

      // ── Crawl ──────────────────────────────────────────────────────────────
      const pages = await crawlerService.crawlWebsite(url, 40, (pct, msg) => {
        emit('crawling', pct, msg);
      });

      emit('processing', 62, `✅ Crawled ${pages.length} pages. Chunking content...`);
      await User.findByIdAndUpdate(userId, { trainingStatus: 'processing', trainingProgress: 62 });

      // ── Chunk ──────────────────────────────────────────────────────────────
      const allChunks = [];
      for (const page of pages) {
        const chunks = crawlerService.chunkText(page.content, 400, 60);
        for (const chunk of chunks) {
          if (chunk.trim().length > 60)
            allChunks.push({ content: chunk, sourceUrl: page.url, title: page.title });
        }
      }

      emit('processing', 65, `📦 ${allChunks.length} chunks created. Generating embeddings...`);

      // ── Embed in batches ───────────────────────────────────────────────────
      const BATCH = 8;
      const embeddings = [];
      for (let i = 0; i < allChunks.length; i += BATCH) {
        const batch = allChunks.slice(i, i + BATCH);
        const batchEmb = await Promise.all(batch.map(c => embeddingService.generateEmbedding(c.content)));
        embeddings.push(...batchEmb);

        const pct = 65 + Math.round(((i + BATCH) / allChunks.length) * 25);
        emit('processing', Math.min(pct, 90), `🧠 Embedded ${Math.min(i + BATCH, allChunks.length)}/${allChunks.length} chunks...`);

        // Rate limit
        if (process.env.EMBEDDING_PROVIDER !== 'local') await this._sleep(300);
      }

      // ── Store ──────────────────────────────────────────────────────────────
      await KnowledgeChunk.deleteMany({ userId });
      emit('processing', 92, '💾 Saving knowledge base...');

      const docs = allChunks.map((c, i) => ({
        userId,
        sourceUrl: c.sourceUrl,
        content:   c.content,
        embedding: embeddings[i] || embeddingService.localEmbedding(c.content),
        metadata:  { title: c.title, chunkIndex: i, totalChunks: allChunks.length, wordCount: c.content.split(/\s+/).length }
      }));

      // Save in batches of 200
      for (let i = 0; i < docs.length; i += 200) await KnowledgeChunk.insertMany(docs.slice(i, i + 200));

      const trainedUrls = [...new Set(pages.map(p => p.url))];
      await User.findByIdAndUpdate(userId, {
        trainingStatus: 'trained', trainingProgress: 100,
        trainedUrls, totalChunks: docs.length, lastTrainedAt: new Date()
      });

      emit('trained', 100, `🎉 Training complete! ${pages.length} pages, ${docs.length} knowledge chunks ready.`, {
        stats: { pages: pages.length, chunks: docs.length, urls: trainedUrls.length }
      });

      logger.info(`Training done for ${userId}: ${pages.length} pages, ${docs.length} chunks`);
      return { success: true, pages: pages.length, chunks: docs.length };

    } catch (error) {
      logger.error(`Training failed: ${error.message}`);
      await User.findByIdAndUpdate(userId, { trainingStatus: 'error', trainingProgress: 0 });
      emit('error', 0, `❌ ${error.message}`);
      throw error;
    }
  }

  async getRelevantContext(userId, question, topK = 5) {
    try {
      const qEmb   = await embeddingService.generateEmbedding(question);
      const chunks  = await KnowledgeChunk.find({ userId }).lean();
      if (!chunks.length) return [];
      return embeddingService.findSimilarChunks(qEmb, chunks, topK);
    } catch (e) {
      logger.error(`Context retrieval: ${e.message}`);
      return [];
    }
  }

  async deleteKnowledgeBase(userId) {
    await KnowledgeChunk.deleteMany({ userId });
    await User.findByIdAndUpdate(userId, {
      trainingStatus: 'idle', trainingProgress: 0,
      trainedUrls: [], totalChunks: 0, lastTrainedAt: null
    });
  }

  _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
}

module.exports = new TrainingService();
