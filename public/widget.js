/**
 * ChatIQ Widget v4 — Smart, Validated, Beautiful
 * Features:
 *  - Real-time client + server validation for name/email/phone
 *  - Smart quick reply buttons (booking/info/support)
 *  - Intent-aware UI hints
 *  - Cleaner dark UI design
 *  - Unread badge, typing dots, smooth animations
 */
(function () {
  'use strict';
  if (window.__AIChatWidgetLoaded) return;
  window.__AIChatWidgetLoaded = true;

  const config    = window.AIChatConfig || {};
  const WIDGET_ID = config.widgetId;
  const SERVER_URL = config.serverUrl
    || (document.currentScript?.src?.match(/^(https?:\/\/[^\/]+)/)?.[1])
    || 'http://localhost:5000';

  if (!WIDGET_ID) { console.error('[ChatIQ] No widgetId in window.AIChatConfig'); return; }

  // ── State ──────────────────────────────────────────────────────────────────
  let socket = null;
  let sessionId     = _sessionId();
  let widgetConfig  = {};
  let isOpen        = false;
  let isTyping      = false;
  let leadCaptured  = false;
  let msgCount      = 0;

  function _sessionId() {
    const k = `aichat_sess_${WIDGET_ID}`;
    let id = sessionStorage.getItem(k);
    if (!id) { id = 'sess_' + Math.random().toString(36).slice(2,9) + '_' + Date.now(); sessionStorage.setItem(k, id); }
    return id;
  }

  // ── Validators (client-side mirror of server) ──────────────────────────────
  function validateEmail(v) {
    if (!v) return 'Email is required.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) return 'Enter a valid email address.';
    const fakeDomains = ['test.com','fake.com','example.com','dummy.com','noemail.com'];
    if (fakeDomains.includes(v.split('@')[1]?.toLowerCase())) return 'Please use a real email address.';
    return null;
  }
  function validatePhone(v) {
    if (!v || v.trim() === '') return null; // optional
    const c = v.replace(/[\s\-().+]/g,'');
    if (!/^\d{7,15}$/.test(c)) return 'Enter a valid phone number (7-15 digits).';
    return null;
  }
  function validateName(v) {
    if (!v || v.trim().length < 2) return 'Enter your full name (min 2 chars).';
    if (/^\d+$/.test(v.trim())) return 'Name cannot be only numbers.';
    return null;
  }

  // ── Utils ──────────────────────────────────────────────────────────────────
  function esc(s) {
    const d = document.createElement('div');
    d.appendChild(document.createTextNode(s || ''));
    return d.innerHTML;
  }
  function fmtTime(d) {
    return new Date(d).toLocaleTimeString('en',{hour:'2-digit',minute:'2-digit'});
  }

  // ── CSS ────────────────────────────────────────────────────────────────────
  function injectStyles(pc) {
    const ex = document.getElementById('chatiq-styles');
    if (ex) ex.remove();
    const s = document.createElement('style');
    s.id = 'chatiq-styles';
    s.textContent = `
      #chatiq-root *, #chatiq-root *::before, #chatiq-root *::after { box-sizing:border-box; margin:0; padding:0; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif; }
      #chatiq-root { position:fixed; z-index:2147483647; }
      #chatiq-root.pos-br { bottom:20px; right:20px; }
      #chatiq-root.pos-bl { bottom:20px; left:20px; }

      /* ── Bubble ── */
      #chatiq-bubble {
        width:58px; height:58px; border-radius:50%;
        background:${pc}; cursor:pointer; border:none; outline:none;
        display:flex; align-items:center; justify-content:center;
        box-shadow:0 4px 20px ${pc}66,0 2px 8px rgba(0,0,0,.3);
        transition:transform .2s,box-shadow .2s;
        animation:ciq-pop .4s cubic-bezier(.34,1.56,.64,1);
        position:relative;
      }
      #chatiq-bubble:hover { transform:scale(1.08); box-shadow:0 6px 28px ${pc}88,0 2px 12px rgba(0,0,0,.35); }
      #chatiq-bubble svg { width:26px; height:26px; fill:none; stroke:#fff; stroke-width:2; stroke-linecap:round; stroke-linejoin:round; }
      #chatiq-badge {
        position:absolute; top:-3px; right:-3px;
        background:#ef4444; color:#fff; font-size:10px; font-weight:700;
        width:18px; height:18px; border-radius:50%; display:flex; align-items:center; justify-content:center;
        border:2px solid #fff;
      }

      /* ── Window ── */
      #chatiq-win {
        position:absolute; bottom:74px;
        width:368px; height:560px; max-height:calc(100vh - 100px);
        background:#0f1117; border-radius:22px;
        box-shadow:0 24px 64px rgba(0,0,0,.6),0 4px 16px rgba(0,0,0,.4);
        display:flex; flex-direction:column; overflow:hidden;
        border:1px solid rgba(255,255,255,.07);
        animation:ciq-up .3s cubic-bezier(.34,1.2,.64,1);
      }
      .pos-br #chatiq-win { right:0; }
      .pos-bl #chatiq-win { left:0; }

      /* ── Header ── */
      #chatiq-header {
        padding:14px 16px; display:flex; align-items:center; gap:10px; flex-shrink:0;
        background:linear-gradient(135deg,${pc},${pc}cc);
        position:relative;
      }
      #chatiq-header::after {
        content:''; position:absolute; bottom:0; left:0; right:0; height:1px;
        background:rgba(255,255,255,.1);
      }
      #chatiq-av {
        width:38px; height:38px; border-radius:50%;
        background:rgba(255,255,255,.15); display:flex; align-items:center; justify-content:center;
        flex-shrink:0; border:2px solid rgba(255,255,255,.2);
      }
      #chatiq-av svg { width:18px; height:18px; stroke:#fff; fill:none; stroke-width:2; stroke-linecap:round; }
      #chatiq-botname { font-size:14px; font-weight:700; color:#fff; }
      #chatiq-status { font-size:11px; color:rgba(255,255,255,.8); display:flex; align-items:center; gap:4px; margin-top:1px; }
      .ciq-dot-online { width:6px; height:6px; border-radius:50%; background:#4ade80; display:inline-block; }
      #chatiq-close {
        margin-left:auto; background:rgba(255,255,255,.12); border:none; cursor:pointer;
        width:30px; height:30px; border-radius:50%; display:flex; align-items:center; justify-content:center;
        color:#fff; font-size:20px; line-height:1; transition:background .15s;
      }
      #chatiq-close:hover { background:rgba(255,255,255,.22); }

      /* ── Messages area ── */
      #chatiq-msgs {
        flex:1; overflow-y:auto; padding:14px 12px 8px;
        display:flex; flex-direction:column; gap:10px;
        scrollbar-width:thin; scrollbar-color:#1f2937 transparent;
        background:#0f1117;
      }
      #chatiq-msgs::-webkit-scrollbar { width:4px; }
      #chatiq-msgs::-webkit-scrollbar-thumb { background:#1f2937; border-radius:4px; }

      /* ── Message bubbles ── */
      .ciq-msg { display:flex; gap:8px; align-items:flex-end; animation:ciq-fadein .22s ease; }
      .ciq-msg.user { flex-direction:row-reverse; }
      .ciq-av { width:28px; height:28px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:700; flex-shrink:0; }
      .ciq-msg.bot .ciq-av { background:${pc}22; color:${pc}; border:1px solid ${pc}44; }
      .ciq-msg.user .ciq-av { background:#374151; color:#9ca3af; }
      .ciq-bub {
        max-width:78%; padding:10px 14px; border-radius:18px;
        font-size:13.5px; line-height:1.58; word-break:break-word;
        white-space:pre-line;
      }
      .ciq-msg.bot .ciq-bub {
        background:#1a1f2e; color:#e5e7eb;
        border-bottom-left-radius:4px;
        border:1px solid rgba(255,255,255,.05);
      }
      .ciq-msg.user .ciq-bub {
        background:${pc}; color:#fff;
        border-bottom-right-radius:4px;
      }
      .ciq-time { font-size:10px; color:#4b5563; margin-top:4px; padding:0 2px; }

      /* ── Typing indicator ── */
      #chatiq-typing { display:flex; gap:8px; align-items:flex-end; }
      #chatiq-typbub {
        background:#1a1f2e; padding:12px 14px; border-radius:18px;
        border-bottom-left-radius:4px; display:flex; gap:5px; align-items:center;
        border:1px solid rgba(255,255,255,.05);
      }
      .ciq-d { width:6px; height:6px; background:#6b7280; border-radius:50%; animation:ciq-bounce 1.3s infinite ease-in-out; }
      .ciq-d:nth-child(1){animation-delay:0s}
      .ciq-d:nth-child(2){animation-delay:.2s}
      .ciq-d:nth-child(3){animation-delay:.4s}

      /* ── Quick reply chips ── */
      #chatiq-chips { padding:8px 12px 4px; display:flex; flex-wrap:wrap; gap:6px; flex-shrink:0; background:#0f1117; }
      .ciq-chip {
        background:#1a1f2e; border:1px solid #2d3748; color:#9ca3af;
        border-radius:20px; padding:6px 13px; font-size:12px; cursor:pointer;
        transition:all .15s; white-space:nowrap;
      }
      .ciq-chip:hover { background:${pc}22; border-color:${pc}66; color:#e5e7eb; }

      /* ── Lead form ── */
      #chatiq-lead {
        flex:1; padding:20px 18px; display:flex; flex-direction:column; gap:14px;
        overflow-y:auto; background:#0f1117;
      }
      .ciq-lead-head { font-size:16px; font-weight:700; color:#f9fafb; text-align:center; }
      .ciq-lead-sub  { font-size:12.5px; color:#6b7280; text-align:center; line-height:1.5; }
      .ciq-fld { display:flex; flex-direction:column; gap:5px; }
      .ciq-fld label { font-size:12px; font-weight:600; color:#9ca3af; }
      .ciq-fld input {
        background:#1a1f2e; border:1.5px solid #2d3748; border-radius:10px;
        padding:10px 13px; color:#f9fafb; font-size:13.5px; outline:none;
        transition:border-color .18s;
      }
      .ciq-fld input:focus { border-color:${pc}; }
      .ciq-fld input.err { border-color:#ef4444 !important; }
      .ciq-fld input::placeholder { color:#374151; }
      .ciq-err { font-size:11px; color:#f87171; min-height:15px; }
      .ciq-hint { font-size:11px; color:#4b5563; }
      .ciq-submit {
        background:${pc}; color:#fff; border:none; border-radius:11px;
        padding:12px; font-size:14px; font-weight:600; cursor:pointer;
        transition:opacity .18s,transform .1s; margin-top:2px;
        box-shadow:0 4px 14px ${pc}44;
      }
      .ciq-submit:hover { opacity:.9; }
      .ciq-submit:active { transform:scale(.98); }
      .ciq-submit:disabled { opacity:.5; cursor:not-allowed; }
      .ciq-skip { text-align:center; font-size:12px; color:#4b5563; cursor:pointer; transition:color .15s; }
      .ciq-skip:hover { color:#9ca3af; }

      /* ── Input area ── */
      #chatiq-inp-area {
        padding:10px 12px; border-top:1px solid rgba(255,255,255,.06); flex-shrink:0;
        display:flex; gap:8px; align-items:flex-end; background:#0f1117;
      }
      #chatiq-inp {
        flex:1; background:#1a1f2e; border:1.5px solid #2d3748; border-radius:13px;
        padding:9px 13px; color:#f9fafb; font-size:13.5px; outline:none;
        resize:none; max-height:80px; font-family:inherit; line-height:1.5;
        transition:border-color .18s;
      }
      #chatiq-inp:focus { border-color:${pc}66; }
      #chatiq-inp::placeholder { color:#374151; }
      #chatiq-send {
        width:38px; height:38px; border-radius:11px; background:${pc}; border:none; cursor:pointer;
        display:flex; align-items:center; justify-content:center; flex-shrink:0;
        transition:opacity .18s,transform .1s;
        box-shadow:0 2px 10px ${pc}44;
      }
      #chatiq-send:hover { opacity:.9; }
      #chatiq-send:active { transform:scale(.95); }
      #chatiq-send:disabled { opacity:.35; cursor:not-allowed; }
      #chatiq-send svg { width:16px; height:16px; stroke:#fff; fill:none; stroke-width:2; stroke-linecap:round; stroke-linejoin:round; }

      /* ── Powered by ── */
      #chatiq-pw { text-align:center; padding:5px 0 8px; font-size:10px; color:#1f2937; flex-shrink:0; background:#0f1117; }

      /* ── Animations ── */
      @keyframes ciq-pop { 0%{transform:scale(0);opacity:0} 100%{transform:scale(1);opacity:1} }
      @keyframes ciq-up  { 0%{transform:translateY(18px) scale(.96);opacity:0} 100%{transform:translateY(0) scale(1);opacity:1} }
      @keyframes ciq-fadein { 0%{opacity:0;transform:translateY(5px)} 100%{opacity:1;transform:translateY(0)} }
      @keyframes ciq-bounce { 0%,60%,100%{transform:translateY(0);opacity:.4} 30%{transform:translateY(-6px);opacity:1} }

      @media(max-width:480px){
        #chatiq-win { width:calc(100vw - 20px); bottom:70px; right:0!important; left:0!important; margin:0 10px; }
      }
    `;
    document.head.appendChild(s);
  }

  // ── HTML builders ──────────────────────────────────────────────────────────
  function buildLeadForm() {
    return `
      <div id="chatiq-lead">
        <div class="ciq-lead-head">👋 Quick Intro</div>
        <div class="ciq-lead-sub">Share your details so we can assist you better.</div>

        <div class="ciq-fld">
          <label for="ciq-name">Full Name <span style="color:#ef4444">*</span></label>
          <input id="ciq-name" type="text" placeholder="e.g. Rahul Sharma" autocomplete="name" />
          <div class="ciq-err" id="ciq-name-err"></div>
        </div>

        <div class="ciq-fld">
          <label for="ciq-email">Email Address <span style="color:#ef4444">*</span></label>
          <input id="ciq-email" type="email" placeholder="you@example.com" autocomplete="email" />
          <div class="ciq-err" id="ciq-email-err"></div>
          <div class="ciq-hint" id="ciq-email-hint"></div>
        </div>

        <div class="ciq-fld">
          <label for="ciq-phone">Phone Number <span style="color:#6b7280">(Optional)</span></label>
          <input id="ciq-phone" type="tel" placeholder="+91 98765 43210" autocomplete="tel" />
          <div class="ciq-err" id="ciq-phone-err"></div>
        </div>

        <button class="ciq-submit" id="ciq-lead-btn">Start Chatting →</button>
        <div class="ciq-skip" id="ciq-skip">Skip for now</div>
      </div>
    `;
  }

  function buildChatArea() {
    return `
      <div id="chatiq-msgs"></div>
      <div id="chatiq-chips"></div>
      <div id="chatiq-inp-area">
        <textarea id="chatiq-inp" placeholder="Type a message..." rows="1"></textarea>
        <button id="chatiq-send" aria-label="Send">
          <svg viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
        </button>
      </div>
      <div id="chatiq-pw">Powered by ChatIQ</div>
    `;
  }

  function createRoot() {
    const pos = widgetConfig.position || 'bottom-right';
    const root = document.createElement('div');
    root.id = 'chatiq-root';
    root.className = pos === 'bottom-left' ? 'pos-bl' : 'pos-br';

    const showLead = widgetConfig.requireLeadInfo && !leadCaptured;

    root.innerHTML = `
      <div id="chatiq-win" style="display:none; flex-direction:column;">
        <div id="chatiq-header">
          <div id="chatiq-av">
            <svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
          </div>
          <div>
            <div id="chatiq-botname">${esc(widgetConfig.botName || 'AI Assistant')}</div>
            <div id="chatiq-status"><span class="ciq-dot-online"></span><span>Online · Typically replies instantly</span></div>
          </div>
          <button id="chatiq-close" aria-label="Close">×</button>
        </div>
        <div id="chatiq-body" style="display:flex;flex-direction:column;flex:1;overflow:hidden;">
          ${showLead ? buildLeadForm() : buildChatArea()}
        </div>
      </div>
      <button id="chatiq-bubble" aria-label="Chat with us">
        <svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
      </button>
    `;
    return root;
  }

  // ── Quick Replies ──────────────────────────────────────────────────────────
  const QUICK_REPLIES = [
    '📋 Services', '💰 Pricing', '📍 Location & Address', '📞 Contact Us', '🗓 Book / Appointment', '❓ How it works'
  ];
  const LANG_CHIPS = [
    { label: '🇬🇧 English', msg: 'english' },
    { label: '🇮🇳 हिंदी', msg: 'hindi' },
    { label: 'मराठी', msg: 'marathi' },
    { label: 'ગુજરાતી', msg: 'gujarati' },
    { label: 'தமிழ்', msg: 'tamil' },
    { label: 'తెలుగు', msg: 'telugu' },
  ];

  let langSelected = false;

  function showChips(type) {
    const el = document.getElementById('chatiq-chips');
    if (!el) return;
    el.innerHTML = '';
    const chips = type === 'lang' ? LANG_CHIPS.map(x => ({ label: x.label, msg: x.msg })) : QUICK_REPLIES.map(x => ({ label: x, msg: x.replace(/^[^\w]+/, '').trim() }));
    chips.forEach(({ label, msg }) => {
      const btn = document.createElement('button');
      btn.className = 'ciq-chip';
      btn.textContent = label;
      btn.addEventListener('click', () => {
        sendMessage(msg);
        if (type === 'lang') { langSelected = true; el.innerHTML = ''; }
        else el.style.display = 'none';
      });
      el.appendChild(btn);
    });
    el.style.display = 'flex';
  }

  // ── Message rendering ──────────────────────────────────────────────────────
  function appendMsg(role, content, ts) {
    const c = document.getElementById('chatiq-msgs');
    if (!c) return;
    const d = document.createElement('div');
    d.className = 'ciq-msg ' + role;
    const init = role === 'bot' ? (widgetConfig.botName?.[0]?.toUpperCase() || 'A') : 'U';
    d.innerHTML = `
      <div class="ciq-av">${esc(init)}</div>
      <div>
        <div class="ciq-bub">${esc(content)}</div>
        <div class="ciq-time">${fmtTime(ts || new Date())}</div>
      </div>
    `;
    c.appendChild(d);
    c.scrollTop = c.scrollHeight;
  }

  function showTyping() {
    const c = document.getElementById('chatiq-msgs');
    if (!c || document.getElementById('chatiq-typing')) return;
    const t = document.createElement('div');
    t.id = 'chatiq-typing';
    t.className = 'ciq-msg bot';
    const init = widgetConfig.botName?.[0]?.toUpperCase() || 'A';
    t.innerHTML = `<div class="ciq-av">${esc(init)}</div><div id="chatiq-typbub"><div class="ciq-d"></div><div class="ciq-d"></div><div class="ciq-d"></div></div>`;
    c.appendChild(t);
    c.scrollTop = c.scrollHeight;
  }
  function hideTyping() {
    document.getElementById('chatiq-typing')?.remove();
  }

  function showBadge() {
    const b = document.getElementById('chatiq-bubble');
    if (!b || document.getElementById('chatiq-badge')) return;
    const badge = document.createElement('div');
    badge.id = 'chatiq-badge';
    badge.textContent = msgCount > 9 ? '9+' : msgCount;
    b.appendChild(badge);
  }
  function removeBadge() {
    document.getElementById('chatiq-badge')?.remove();
  }

  // ── Lead form logic ────────────────────────────────────────────────────────
  function bindLeadForm() {
    const nameIn  = document.getElementById('ciq-name');
    const emailIn = document.getElementById('ciq-email');
    const phoneIn = document.getElementById('ciq-phone');
    const btn     = document.getElementById('ciq-lead-btn');
    const skip    = document.getElementById('ciq-skip');

    if (!nameIn || !btn) return;

    // Live validation feedback
    function setFieldErr(id, msg) {
      const el = document.getElementById(id);
      if (el) el.textContent = msg || '';
    }
    function markField(el, isErr) {
      if (isErr) el.classList.add('err'); else el.classList.remove('err');
    }

    emailIn?.addEventListener('blur', () => {
      const err = validateEmail(emailIn.value.trim());
      setFieldErr('ciq-email-err', err || '');
      markField(emailIn, !!err);
      if (!err && emailIn.value.trim()) {
        document.getElementById('ciq-email-hint').textContent = '✓ Looks good!';
        document.getElementById('ciq-email-hint').style.color = '#4ade80';
      } else {
        document.getElementById('ciq-email-hint').textContent = '';
      }
    });
    phoneIn?.addEventListener('blur', () => {
      const err = validatePhone(phoneIn.value.trim());
      setFieldErr('ciq-phone-err', err || '');
      markField(phoneIn, !!err);
    });
    nameIn?.addEventListener('blur', () => {
      const err = validateName(nameIn.value.trim());
      setFieldErr('ciq-name-err', err || '');
      markField(nameIn, !!err);
    });

    btn.addEventListener('click', () => {
      const name  = nameIn.value.trim();
      const email = emailIn.value.trim();
      const phone = phoneIn?.value?.trim() || '';

      const nameErr  = validateName(name);
      const emailErr = validateEmail(email);
      const phoneErr = validatePhone(phone);

      setFieldErr('ciq-name-err',  nameErr  || '');
      setFieldErr('ciq-email-err', emailErr || '');
      setFieldErr('ciq-phone-err', phoneErr || '');
      markField(nameIn,  !!nameErr);
      markField(emailIn, !!emailErr);
      if (phoneIn) markField(phoneIn, !!phoneErr);

      if (nameErr || emailErr || phoneErr) return;

      btn.disabled = true;
      btn.textContent = 'Saving...';

      socket?.emit('widget:lead', { sessionId, name, email, phone });
    });

    // Server-side validation errors
    if (socket) {
      socket.on('widget:lead:error', ({ field, msg }) => {
        btn.disabled = false;
        btn.textContent = 'Start Chatting →';
        if (field === 'name')  { setFieldErr('ciq-name-err',  msg); markField(nameIn,  true); }
        if (field === 'email') { setFieldErr('ciq-email-err', msg); markField(emailIn, true); }
        if (field === 'phone') { setFieldErr('ciq-phone-err', msg); if (phoneIn) markField(phoneIn, true); }
        if (field === 'general') { setFieldErr('ciq-email-err', msg); }
      });
    }

    skip?.addEventListener('click', () => {
      leadCaptured = true;
      switchToChat();
    });
  }

  function switchToChat() {
    const body = document.getElementById('chatiq-body');
    if (!body) return;
    body.innerHTML = buildChatArea();
    bindInputHandlers();
    setTimeout(() => sendMessage('__init__'), 300);
  }

  // ── Input / send ───────────────────────────────────────────────────────────
  function sendMessage(text) {
    text = text.trim();
    if (!text || isTyping) return;
    appendMsg('user', text);
    socket?.emit('widget:message', { sessionId, message: text });
    const inp = document.getElementById('chatiq-inp');
    if (inp) { inp.value = ''; inp.style.height = 'auto'; }
    const sendBtn = document.getElementById('chatiq-send');
    if (sendBtn) sendBtn.disabled = true;
  }

  function bindInputHandlers() {
    const inp     = document.getElementById('chatiq-inp');
    const sendBtn = document.getElementById('chatiq-send');
    if (!inp || !sendBtn) return;

    sendBtn.addEventListener('click', () => sendMessage(inp.value));
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(inp.value); }
    });
    inp.addEventListener('input', () => {
      inp.style.height = 'auto';
      inp.style.height = Math.min(inp.scrollHeight, 80) + 'px';
    });
  }

  // ── Socket ─────────────────────────────────────────────────────────────────
  function connectSocket() {
    if (window.io) initSocket();
    else {
      const s = document.createElement('script');
      s.src = SERVER_URL + '/socket.io/socket.io.js';
      s.onload = initSocket;
      s.onerror = () => console.error('[ChatIQ] socket.io load failed');
      document.head.appendChild(s);
    }
  }

  function initSocket() {
    socket = window.io(SERVER_URL, { transports: ['websocket','polling'] });

    socket.on('connect', () => {
      socket.emit('widget:init', {
        widgetId: WIDGET_ID, sessionId,
        metadata: { userAgent: navigator.userAgent, referrer: document.referrer, page: window.location.href }
      });
    });

    socket.on('widget:ready', cfg => {
      Object.assign(widgetConfig, cfg);
      injectStyles(widgetConfig.primaryColor || '#6366f1');
      renderWidget();
    });

    socket.on('widget:typing', ({ isTyping: t }) => {
      isTyping = t;
      if (t) showTyping(); else hideTyping();
      const sb = document.getElementById('chatiq-send');
      if (sb) sb.disabled = t;
    });

    socket.on('widget:response', ({ message, action }) => {
      hideTyping();
      isTyping = false;
      appendMsg('bot', message);
      msgCount++;
      const sb = document.getElementById('chatiq-send');
      if (sb) sb.disabled = false;
      if (!isOpen) showBadge();
      // Show appropriate chips based on action
      if (action?.type === 'ask_lang') {
        setTimeout(() => showChips('lang'), 300);
      } else if (!langSelected && action?.type === 'set_lang') {
        langSelected = true;
        setTimeout(() => showChips('quick'), 400);
      }
    });

    socket.on('widget:lead:saved', () => {
      leadCaptured = true;
      sessionStorage.setItem(`aichat_lead_${WIDGET_ID}`, '1');
      switchToChat();
    });

    socket.on('widget:error', ({ message: m }) => {
      hideTyping();
      appendMsg('bot', '⚠️ ' + (m || 'Something went wrong. Please try again.'));
      const sb = document.getElementById('chatiq-send');
      if (sb) sb.disabled = false;
    });
  }

  // ── Widget render ──────────────────────────────────────────────────────────
  function renderWidget() {
    document.getElementById('chatiq-root')?.remove();
    leadCaptured = !!sessionStorage.getItem(`aichat_lead_${WIDGET_ID}`) || !widgetConfig.requireLeadInfo;

    const root = createRoot();
    document.body.appendChild(root);

    document.getElementById('chatiq-bubble')?.addEventListener('click', toggle);
    document.getElementById('chatiq-close')?.addEventListener('click', close);

    if (widgetConfig.requireLeadInfo && !leadCaptured) {
      bindLeadForm();
    } else {
      bindInputHandlers();
    }
  }

  function toggle() { isOpen ? close() : open(); }

  function open() {
    const win = document.getElementById('chatiq-win');
    const bbl = document.getElementById('chatiq-bubble');
    if (!win) return;
    isOpen = true;
    win.style.display = 'flex';
    removeBadge();
    bbl.innerHTML = `<svg viewBox="0 0 24 24" style="width:22px;height:22px;stroke:#fff;fill:none;stroke-width:2.5;stroke-linecap:round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;

    const msgs = document.getElementById('chatiq-msgs');
    if (msgs && msgs.children.length === 0 && !widgetConfig.requireLeadInfo) {
      sendMessage('__init__');
    }
    setTimeout(() => document.getElementById('chatiq-inp')?.focus(), 250);
  }

  function close() {
    const win = document.getElementById('chatiq-win');
    const bbl = document.getElementById('chatiq-bubble');
    if (!win) return;
    isOpen = false;
    win.style.display = 'none';
    bbl.innerHTML = `<svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`;
  }

  // ── Bootstrap ──────────────────────────────────────────────────────────────
  function init() {
    fetch(`${SERVER_URL}/api/widget/config/${WIDGET_ID}`)
      .then(r => r.json())
      .then(d => {
        if (d.success) Object.assign(widgetConfig, d.config);
        injectStyles(widgetConfig.primaryColor || '#6366f1');
        connectSocket();
      })
      .catch(() => { injectStyles('#6366f1'); connectSocket(); });
  }

  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', init) : init();
})();
