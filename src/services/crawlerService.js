/**
 * ChatIQ Universal Crawler
 * Supports: Static HTML, React/Vue/Angular (SPA), WordPress, and all JS-rendered sites
 * Uses Puppeteer as primary + Axios/Cheerio as fallback
 */
const axios   = require('axios');
const cheerio = require('cheerio');
const https   = require('https');
const logger  = require('../utils/logger');

class CrawlerService {
  constructor() {
    this.http = axios.create({
      timeout: 25000,
      httpsAgent: new https.Agent({ rejectUnauthorized: false }),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
      },
      maxRedirects: 5,
    });
    this.browser = null;
  }

  // Detect if site needs JS rendering
  async _needsJS(url) {
    try {
      const res = await this.http.get(url);
      const html = res.data || '';
      const $ = cheerio.load(html);
      $('script,style,noscript').remove();
      const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
      return (
        bodyText.length < 200 ||
        html.includes('id="root"') ||
        html.includes('id="app"') ||
        html.includes('data-reactroot') ||
        html.includes('ng-version') ||
        html.includes('__NEXT_DATA__') ||
        html.includes('__NUXT__') ||
        html.includes('window.__INITIAL_STATE__') ||
        (html.includes('<script') && bodyText.length < 500)
      );
    } catch {
      return true;
    }
  }

  async _getBrowser() {
    if (this.browser && this.browser.connected) return this.browser;
    try {
      const puppeteer = require('puppeteer');
      this.browser = await puppeteer.launch({
        headless: 'new',
        args: [
          '--no-sandbox', '--disable-setuid-sandbox',
          '--disable-dev-shm-usage', '--disable-accelerated-2d-canvas',
          '--disable-gpu', '--window-size=1280,800',
        ],
      });
      logger.info('Crawler: Puppeteer launched');
      return this.browser;
    } catch (e) {
      logger.warn('Puppeteer unavailable: ' + e.message);
      return null;
    }
  }

  async _fetchWithPuppeteer(url) {
    let page = null;
    try {
      const browser = await this._getBrowser();
      if (!browser) return null;

      page = await browser.newPage();
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36');
      await page.setViewport({ width: 1280, height: 800 });

      await page.setRequestInterception(true);
      page.on('request', req => {
        const t = req.resourceType();
        if (['image', 'media', 'font', 'stylesheet'].includes(t)) req.abort();
        else req.continue();
      });

      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
      await new Promise(r => setTimeout(r, 1500));
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await new Promise(r => setTimeout(r, 500));

      const result = await page.evaluate(() => {
        const noiseSelectors = [
          'script','style','noscript','iframe','svg','canvas',
          'nav','header','footer','aside',
          '[class*="nav"]','[class*="menu"]','[class*="sidebar"]',
          '[class*="header"]','[class*="footer"]','[class*="cookie"]',
          '[class*="popup"]','[class*="modal"]','[class*="banner"]',
          '[class*="overlay"]','[id*="cookie"]','[id*="popup"]',
          '[aria-hidden="true"]'
        ];
        noiseSelectors.forEach(sel => {
          document.querySelectorAll(sel).forEach(el => el.remove());
        });

        const title = document.title || document.querySelector('h1')?.textContent?.trim() || '';
        let content = '';

        const mainSelectors = [
          'main','article','[role="main"]','#main','#content',
          '.main-content','.page-content','.entry-content','.post-content',
          '.article-body','#primary','.site-main','.content-area'
        ];
        for (const sel of mainSelectors) {
          const el = document.querySelector(sel);
          if (el) {
            const t = el.innerText.replace(/\s+/g,' ').trim();
            if (t.length > 300) { content = t; break; }
          }
        }

        if (content.length < 300) {
          const seen = new Set();
          const parts = [];
          document.querySelectorAll('h1,h2,h3,h4,h5,p,li,td,th,blockquote,dt,dd').forEach(el => {
            const t = el.innerText?.replace(/\s+/g,' ').trim();
            if (t && t.length > 20 && t.length < 2000 && !seen.has(t)) {
              seen.add(t);
              parts.push(t);
            }
          });
          content = parts.join(' ');
        }

        if (content.length < 200) {
          content = document.body?.innerText?.replace(/\s+/g,' ').trim() || '';
        }

        const links = Array.from(document.querySelectorAll('a[href]'))
          .map(a => a.href)
          .filter(h => h && !h.startsWith('javascript:') && !h.startsWith('mailto:'));

        return { title, content, links };
      });

      await page.close();
      page = null;

      const content = this.cleanText(result.content);
      if (content.length < 80) return null;

      return { url, title: result.title, content, rawLinks: result.links, wordCount: content.split(/\s+/).length, method: 'puppeteer' };
    } catch (e) {
      if (page) { try { await page.close(); } catch {} }
      logger.debug('Puppeteer failed for ' + url + ': ' + e.message);
      return null;
    }
  }

  async _fetchWithCheerio(url) {
    try {
      const res = await this.http.get(url);
      const ct  = res.headers['content-type'] || '';
      if (!ct.includes('text/html')) return null;

      const $ = cheerio.load(res.data);
      $('script,style,noscript,iframe,svg,canvas,video,audio,picture').remove();
      $('nav,footer,header,aside,[class*="nav"],[class*="menu"],[class*="sidebar"],[class*="header"],[class*="footer"]').remove();
      $('[class*="cookie"],[class*="popup"],[class*="modal"],[class*="banner"],[class*="overlay"],[id*="cookie"],[id*="popup"]').remove();

      const title = $('title').text().trim() || $('h1').first().text().trim() || url;
      let content = '';

      for (const sel of ['main','article','[role="main"]','#main','#content','.main-content','.page-content','.entry-content','.post-content','.article-body','#primary','.site-main']) {
        const t = $(sel).text().replace(/\s+/g,' ').trim();
        if (t.length > 300) { content = t; break; }
      }

      if (content.length < 300) {
        const seen = new Set();
        const parts = [];
        $('h1,h2,h3,h4,h5,p,li,td,th,blockquote,dt,dd,.description,.text,.body').each((_, el) => {
          const t = $(el).text().replace(/\s+/g,' ').trim();
          if (t.length > 25 && !seen.has(t)) { seen.add(t); parts.push(t); }
        });
        content = parts.join(' ');
      }

      if (content.length < 300) {
        content = $('body').text().replace(/\s+/g,' ').trim();
      }

      content = this.cleanText(content);
      if (content.length < 80) return null;

      const rawLinks = [];
      $('a[href]').each((_, el) => { const h = $(el).attr('href'); if (h) rawLinks.push(h); });

      return { url, title, content, rawLinks, wordCount: content.split(/\s+/).length, method: 'cheerio' };
    } catch (e) {
      if (e.response?.status === 404 || e.response?.status === 410) return null;
      logger.debug('Cheerio skip ' + url + ': ' + e.message);
      return null;
    }
  }

  async _fetchPage(url, forceJS = false) {
    if (!forceJS) {
      const r = await this._fetchWithCheerio(url);
      if (r && r.wordCount >= 80) return r;
    }
    return await this._fetchWithPuppeteer(url);
  }

  async crawlWebsite(startUrl, maxPages = 40, onProgress = null) {
    this.visited = new Set();
    const results = [];
    let baseUrl;
    try { baseUrl = new URL(startUrl).origin; } catch { throw new Error('Invalid URL'); }

    const emit = (pct, msg) => onProgress && onProgress(pct, msg);
    emit(5, '🔍 Detecting website type...');

    const needsJS = await this._needsJS(startUrl);
    emit(8, needsJS ? '⚛️ React/SPA/WordPress detected — using JS renderer...' : '📄 Static site detected — using fast crawler...');

    const main = await this._fetchPage(startUrl, needsJS);
    if (main) { results.push(main); this.visited.add(startUrl); emit(12, '✅ Homepage: ' + main.wordCount + ' words found'); }
    else { this.visited.add(startUrl); emit(12, '⚠️ Homepage returned little content, trying subpages...'); }

    const queue = new Set();
    if (main) this._extractLinks(main.rawLinks, startUrl, baseUrl).forEach(l => queue.add(l));

    ['/about','/about-us','/services','/products','/contact','/blog',
     '/faq','/pricing','/features','/team','/privacy-policy','/terms',
     '/help','/support','/home','/our-services','/what-we-do','/portfolio',
     '/work','/clients','/testimonials','/careers','/news','/events',
     '/solutions','/why-us','/how-it-works','/process',
    ].forEach(p => { const u = baseUrl + p; if (!this.visited.has(u)) queue.add(u); });

    let i = 0;
    for (const url of queue) {
      if (this.visited.size >= maxPages) break;
      if (this.visited.has(url)) continue;
      this.visited.add(url);

      const page = await this._fetchPage(url, needsJS);
      if (page) {
        results.push(page);
        this._extractLinks(page.rawLinks, url, baseUrl).filter(l => !this.visited.has(l)).forEach(l => queue.add(l));
      }

      i++;
      const pct = Math.min(12 + Math.round((i / Math.max(queue.size, 1)) * 48), 60);
      emit(pct, '📄 Crawled ' + results.length + ' pages (' + this.visited.size + ' visited)...');
      await this._sleep(needsJS ? 500 : 150);
    }

    if (this.browser) { try { await this.browser.close(); this.browser = null; } catch {} }

    logger.info('Crawl done: ' + results.length + ' pages (JS mode: ' + needsJS + ')');
    if (results.length === 0) throw new Error('No readable content found. Please use Manual Training to add your business info directly.');
    return results;
  }

  _extractLinks(rawLinks = [], currentUrl, baseUrl) {
    const links = new Set();
    for (const href of rawLinks) {
      try {
        if (!href || /^(javascript:|mailto:|tel:|#|data:)/.test(href)) continue;
        const abs    = new URL(href, currentUrl).href.split('#')[0].split('?')[0];
        const parsed = new URL(abs);
        if (parsed.origin !== baseUrl) continue;
        if (/\.(pdf|jpg|jpeg|png|gif|svg|zip|rar|doc|xls|ppt|mp4|mp3|css|js|ico|woff|ttf|eot|webp|xml|json|txt|csv)$/i.test(parsed.pathname)) continue;
        links.add(abs);
      } catch {}
    }
    return [...links];
  }

  cleanText(text) {
    return (text || '')
      .replace(/[\r\n\t]+/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .replace(/[^\w\s.,!?;:()\-'"@#%&+=/]/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  chunkText(text, size = 400, overlap = 60) {
    const words  = text.split(/\s+/).filter(Boolean);
    const chunks = [];
    for (let i = 0; i < words.length; i += size - overlap) {
      const chunk = words.slice(i, i + size).join(' ').trim();
      if (chunk.length > 60) chunks.push(chunk);
      if (i + size >= words.length) break;
    }
    return chunks;
  }

  _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
}

module.exports = new CrawlerService();
