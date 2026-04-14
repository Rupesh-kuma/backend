/**
 * ChatIQ Embedding Engine — 100% Built-in
 * TF-IDF + semantic hashing. No external API needed.
 */
const logger = require('../utils/logger');

class EmbeddingService {
  constructor() {
    this.dim = 512;
    logger.info('Embeddings: ChatIQ built-in engine active');
  }

  async generateEmbedding(text) {
    return this.localEmbedding(text);
  }

  localEmbedding(text) {
    const dim = this.dim;
    const vec = new Float64Array(dim).fill(0);
    if (!text) return Array.from(vec);

    const normalized = text.toLowerCase().replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim();
    const words = normalized.split(' ').filter(w => w.length > 1);

    for (let wi = 0; wi < words.length; wi++) {
      const word = words[wi];
      const posW = 1 / (1 + wi * 0.05);
      for (let h = 0; h < 4; h++) {
        const idx = Math.abs(this._hash(word + '_' + h)) % dim;
        vec[idx] += ([1.0,0.7,0.5,0.3][h]) * posW;
      }
      if (wi + 1 < words.length) {
        const idx = Math.abs(this._hash(word + '_' + words[wi+1])) % dim;
        vec[idx] += 1.5 * posW;
      }
      if (word.length >= 3) {
        for (let i = 0; i <= word.length - 3; i++) {
          vec[Math.abs(this._hash('ng_' + word.slice(i,i+3))) % dim] += 0.3;
        }
      }
    }

    const freq = {};
    words.forEach(w => { freq[w] = (freq[w]||0)+1; });
    for (const [w, f] of Object.entries(freq)) {
      if (f === 1) vec[Math.abs(this._hash(w+'_u')) % dim] += 0.5;
    }

    return this._norm(Array.from(vec));
  }

  _norm(v) {
    const m = Math.sqrt(v.reduce((s,x) => s+x*x, 0));
    return m === 0 ? v : v.map(x => x/m);
  }

  _hash(s) {
    let h1=0xdeadbeef, h2=0x41c6ce57;
    for (let i=0;i<s.length;i++) {
      const c=s.charCodeAt(i);
      h1=Math.imul(h1^c,2654435761); h2=Math.imul(h2^c,1597334677);
    }
    h1=Math.imul(h1^(h1>>>16),2246822507)^Math.imul(h2^(h2>>>13),3266489909);
    h2=Math.imul(h2^(h2>>>16),2246822507)^Math.imul(h1^(h1>>>13),3266489909);
    return 4294967296*(2097151&h2)+(h1>>>0);
  }

  cosineSimilarity(a, b) {
    if (!a||!b||a.length!==b.length) return 0;
    let dot=0,na=0,nb=0;
    for (let i=0;i<a.length;i++) { dot+=a[i]*b[i]; na+=a[i]*a[i]; nb+=b[i]*b[i]; }
    const d=Math.sqrt(na)*Math.sqrt(nb);
    return d===0?0:dot/d;
  }

  async findSimilarChunks(queryEmbedding, chunks, topK=5) {
    const scored = chunks.map(c => ({ c, s: this.cosineSimilarity(queryEmbedding, c.embedding) }))
      .filter(x => x.s > 0.01)
      .sort((a,b) => b.s-a.s)
      .slice(0, topK);
    if (scored.length === 0 && chunks.length > 0) return chunks.slice(0, topK);
    return scored.map(x => x.c);
  }

  async generateBatchEmbeddings(texts, batchSize=8) {
    const r=[];
    for (let i=0;i<texts.length;i+=batchSize) {
      r.push(...await Promise.all(texts.slice(i,i+batchSize).map(t=>this.generateEmbedding(t))));
    }
    return r;
  }
}

module.exports = new EmbeddingService();
