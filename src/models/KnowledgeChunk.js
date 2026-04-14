const mongoose = require('mongoose');

const knowledgeChunkSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  sourceUrl: { type: String, required: true },
  content: { type: String, required: true },
  embedding: {
    type: [Number],
    required: true
  },
  metadata: {
    title: String,
    heading: String,
    chunkIndex: Number,
    totalChunks: Number,
    wordCount: Number
  },
  createdAt: { type: Date, default: Date.now }
});

// Index for efficient user-based queries
knowledgeChunkSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('KnowledgeChunk', knowledgeChunkSchema);
