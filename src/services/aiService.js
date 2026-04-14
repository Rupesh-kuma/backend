/**
 * ChatIQ Smart AI Engine v5
 * - Multi-language detection & reply
 * - Step-by-step lead collection (name → email → phone)
 * - Intent detection (booking / pricing / support / info)
 * - Concise focused answers from knowledge base
 * - No third-party API required
 */
const logger = require('../utils/logger');

// ── Language data ─────────────────────────────────────────────────────────────
const LANGS = {
  hi: {
    name: 'Hindi', greeting: 'नमस्ते! 👋 मैं {bot} हूँ। आप किस भाषा में बात करना चाहेंगे?',
    askName: 'आपका पूरा नाम क्या है?',
    askEmail: 'आपका ईमेल पता क्या है?',
    askPhone: 'आपका फ़ोन नंबर क्या है? (वैकल्पिक, छोड़ने के लिए "skip" लिखें)',
    thanks: 'धन्यवाद! 😊 क्या मैं आपकी और मदद कर सकता हूँ?',
    bye: 'धन्यवाद! आपका दिन शुभ हो! 😊',
    noInfo: 'मुझे इस बारे में जानकारी नहीं है। कृपया हमारी टीम से संपर्क करें।',
    fallback: 'मुझे खेद है, मैं इसका उत्तर नहीं दे पाया। हमारी टीम से संपर्क करें।',
    bookingCta: '\n\n📞 बुकिंग के लिए अपनी जानकारी साझा करें या नीचे दिए फ़ॉर्म को भरें।',
    pricingCta: '\n\n💡 सटीक मूल्य के लिए हमसे संपर्क करें।',
    supportCta: '\n\n🛠 सहायता के लिए अपनी समस्या विस्तार से बताएं।',
    selectLang: 'कृपया अपनी भाषा चुनें:'
  },
  en: {
    name: 'English', greeting: 'Hello! 👋 I\'m {bot}. How can I help you today?',
    askName: 'What\'s your full name?',
    askEmail: 'What\'s your email address?',
    askPhone: 'What\'s your phone number? (Optional — type "skip" to skip)',
    thanks: 'You\'re welcome! 😊 Anything else I can help with?',
    bye: 'Thanks for chatting! Have a great day! 😊',
    noInfo: 'I don\'t have specific info on that. Please contact our team!',
    fallback: 'I couldn\'t find an answer to that. Please contact our support team!',
    bookingCta: '\n\n📞 To book, please share your contact details.',
    pricingCta: '\n\n💡 Contact us for exact pricing.',
    supportCta: '\n\n🛠 Share your issue details and we\'ll help ASAP.',
    selectLang: 'Please select your language:'
  },
  mr: {
    name: 'Marathi', greeting: 'नमस्कार! 👋 मी {bot} आहे. मी तुम्हाला कशी मदत करू?',
    askName: 'तुमचे पूर्ण नाव काय आहे?',
    askEmail: 'तुमचा ईमेल पत्ता काय आहे?',
    askPhone: 'तुमचा फोन नंबर काय आहे? (ऐच्छिक — वगळण्यासाठी "skip" लिहा)',
    thanks: 'धन्यवाद! 😊 आणखी काही मदत हवी आहे का?',
    bye: 'धन्यवाद! तुमचा दिवस छान जावो! 😊',
    noInfo: 'मला याबद्दल माहिती नाही. कृपया आमच्या टीमशी संपर्क करा.',
    fallback: 'मला उत्तर सापडले नाही. कृपया आमच्या सपोर्ट टीमशी संपर्क करा.',
    bookingCta: '\n\n📞 बुकिंगसाठी आपली माहिती द्या.',
    pricingCta: '\n\n💡 अचूक किंमतीसाठी आमच्याशी संपर्क करा.',
    supportCta: '\n\n🛠 तुमची समस्या सांगा, आम्ही मदत करू.',
    selectLang: 'कृपया तुमची भाषा निवडा:'
  },
  gu: {
    name: 'Gujarati', greeting: 'નમસ્તે! 👋 હું {bot} છું. હું આજે તમને કેવી રીતે મદદ કરી શકું?',
    askName: 'તમારું પૂરું નામ શું છે?',
    askEmail: 'તમારું ઈમેઈલ સરનામું શું છે?',
    askPhone: 'તમારો ફોન નંબર શું છે? (વૈકલ્પિક — skip કરવા "skip" ટાઈપ કરો)',
    thanks: 'આભાર! 😊 બીજી કોઈ મદદ?',
    bye: 'ચેટ કરવા બદલ આભાર! સુંદર દિવસ! 😊',
    noInfo: 'મને આ વિષે ચોક્કસ માહિતી નથી. કૃપા કરી અમારી ટીમ સાથે સંપર્ક કરો.',
    fallback: 'હું જવાબ શોધી ન શક્યો. કૃપા કરી સપોર્ટ ટીમ સાથે સંપર્ક કરો.',
    bookingCta: '\n\n📞 બુકિંગ માટે તમારી વિગત શેર કરો.',
    pricingCta: '\n\n💡 ચોક્કસ ભાવ માટે અમારો સંપર્ક કરો.',
    supportCta: '\n\n🛠 સમસ્યા વિગતો સાથે જણાવો.',
    selectLang: 'કૃપા કરી તમારી ભાષા પસંદ કરો:'
  },
  ta: {
    name: 'Tamil', greeting: 'வணக்கம்! 👋 நான் {bot}. நான் உங்களுக்கு எப்படி உதவலாம்?',
    askName: 'உங்கள் முழு பெயர் என்ன?',
    askEmail: 'உங்கள் மின்னஞ்சல் முகவரி என்ன?',
    askPhone: 'உங்கள் தொலைபேசி எண் என்ன? (விரும்பினால் — தவிர்க்க "skip" என்று தட்டச்சு செய்யுங்கள்)',
    thanks: 'நன்றி! 😊 வேறு ஏதாவது உதவி வேண்டுமா?',
    bye: 'அரட்டை அடித்ததற்கு நன்றி! நல்ல நாள்! 😊',
    noInfo: 'அதைப் பற்றி எனக்கு குறிப்பிட்ட தகவல் இல்லை. எங்கள் குழுவை தொடர்பு கொள்ளுங்கள்.',
    fallback: 'பதிலை கண்டுபிடிக்க முடியவில்லை. ஆதரவுக் குழுவை தொடர்பு கொள்ளுங்கள்.',
    bookingCta: '\n\n📞 முன்பதிவு செய்ய உங்கள் தகவல்களை பகிர்ந்து கொள்ளுங்கள்.',
    pricingCta: '\n\n💡 சரியான விலைக்கு எங்களை தொடர்பு கொள்ளுங்கள்.',
    supportCta: '\n\n🛠 உங்கள் சிக்கல் விவரங்களை பகிரவும்.',
    selectLang: 'உங்கள் மொழியை தேர்ந்தெடுக்கவும்:'
  },
  te: {
    name: 'Telugu', greeting: 'నమస్కారం! 👋 నేను {bot}ని. మీకు ఎలా సహాయం చేయగలను?',
    askName: 'మీ పూర్తి పేరు ఏమిటి?',
    askEmail: 'మీ ఇమెయిల్ చిరునామా ఏమిటి?',
    askPhone: 'మీ ఫోన్ నంబర్ ఏమిటి? (ఐచ్ఛికం — దాటవేయడానికి "skip" అని టైప్ చేయండి)',
    thanks: 'ధన్యవాదాలు! 😊 మరింత సహాయం కావాలా?',
    bye: 'చాట్ చేసినందుకు ధన్యవాదాలు! మంచి రోజు! 😊',
    noInfo: 'నాకు దాని గురించి నిర్దిష్ట సమాచారం లేదు. మా బృందాన్ని సంప్రదించండి.',
    fallback: 'సమాధానం కనుగొనలేకపోయాను. సపోర్ట్ టీమ్‌ని సంప్రదించండి.',
    bookingCta: '\n\n📞 బుకింగ్ కోసం మీ వివరాలు పంచుకోండి.',
    pricingCta: '\n\n💡 ఖచ్చితమైన ధర కోసం మమ్మల్ని సంప్రదించండి.',
    supportCta: '\n\n🛠 మీ సమస్య వివరాలు తెలియజేయండి.',
    selectLang: 'దయచేసి మీ భాషను ఎంచుకోండి:'
  }
};

const LANG_CODES = Object.keys(LANGS);

class AIService {
  constructor() {
    logger.info('AI: ChatIQ Smart Built-in Engine v5 active (multi-language)');
  }

  async generateResponse(userMessage, contextChunks, systemPrompt, history = [], sessionMeta = {}) {
    try {
      return this._smartAI(userMessage, contextChunks, systemPrompt, history, sessionMeta);
    } catch (err) {
      logger.error('AI error: ' + err.message);
      return { text: "Sorry, I ran into an issue. Please try again!", provider: 'local', action: null };
    }
  }

  // ══════════════════════════════════════════════════════════════
  _smartAI(question, contextChunks, systemPrompt, history, sessionMeta = {}) {
    // Handle init message
    if (question.trim() === '__init__') {
      return {
        text: this._langSelectionMsg(this._extractBotName(systemPrompt)),
        provider: 'local',
        action: { type: 'ask_lang' }
      };
    }
    const q    = question.trim();
    const ql   = q.toLowerCase();
    const lang = sessionMeta.lang || this._detectLang(q, history);
    const L    = LANGS[lang] || LANGS.en;
    const botName = this._extractBotName(systemPrompt);

    // ── LANGUAGE SELECTION FLOW ───────────────────────────────────────────
    // If user just selected a language number or name
    const selectedLang = this._parseLangSelection(q);
    if (selectedLang && !sessionMeta.lang) {
      const sl = LANGS[selectedLang];
      return {
        text: sl.greeting.replace('{bot}', botName),
        provider: 'local',
        action: { type: 'set_lang', lang: selectedLang }
      };
    }

    // ── FIRST MESSAGE: ask language ───────────────────────────────────────
    const isFirstMsg = !history || history.length === 0;
    if (isFirstMsg && !sessionMeta.lang) {
      return {
        text: this._langSelectionMsg(botName),
        provider: 'local',
        action: { type: 'ask_lang' }
      };
    }

    // ── STEP-BY-STEP LEAD COLLECTION ──────────────────────────────────────
    if (sessionMeta.leadStep) {
      return this._handleLeadStep(q, sessionMeta, L, history, contextChunks, systemPrompt);
    }

    // ── GREETINGS ─────────────────────────────────────────────────────────
    if (this._isGreeting(ql)) {
      return { text: L.greeting.replace('{bot}', botName), provider: 'local', action: null };
    }

    // ── FAREWELL ──────────────────────────────────────────────────────────
    if (this._isFarewell(ql)) {
      return { text: L.bye, provider: 'local', action: null };
    }

    // ── THANKS ────────────────────────────────────────────────────────────
    if (this._isThanks(ql)) {
      return { text: L.thanks, provider: 'local', action: null };
    }

    // ── INTENT DETECTION ─────────────────────────────────────────────────
    const intent = this._detectIntent(ql);

    // ── BOOKING INTENT → start lead collection ────────────────────────────
    if (intent === 'booking' && !sessionMeta.leadCollected) {
      return {
        text: (lang === 'hi'
          ? 'बिल्कुल! हम आपकी बुकिंग में मदद करेंगे। ' 
          : 'Sure! Let me help you with that. ') + L.askName,
        provider: 'local',
        action: { type: 'start_lead', step: 'name' }
      };
    }

    // ── NO KNOWLEDGE BASE ─────────────────────────────────────────────────
    const hasContext = contextChunks && contextChunks.length > 0;
    if (!hasContext) {
      return { text: this._noKnowledgeReply(intent, L, botName), provider: 'local', action: null };
    }

    // ── RAG ANSWER ────────────────────────────────────────────────────────
    const answer = this._buildSmartAnswer(q, ql, contextChunks, intent, L);
    return { text: answer, provider: 'local', action: null };
  }

  // ── STEP-BY-STEP LEAD COLLECTION ──────────────────────────────────────────
  _handleLeadStep(input, meta, L, history, chunks, systemPrompt) {
    const step = meta.leadStep;
    const inp  = input.trim();

    if (step === 'name') {
      if (inp.length < 2 || /^\d+$/.test(inp)) {
        return { text: '❗ ' + (L.askName), provider: 'local', action: { type: 'lead_step', step: 'name', error: true } };
      }
      return {
        text: `Nice to meet you, ${inp}! 😊 ${L.askEmail}`,
        provider: 'local',
        action: { type: 'lead_step', step: 'email', name: inp }
      };
    }

    if (step === 'email') {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(inp)) {
        return { text: '❗ Please enter a valid email address.\n' + L.askEmail, provider: 'local', action: { type: 'lead_step', step: 'email', error: true } };
      }
      return {
        text: L.askPhone,
        provider: 'local',
        action: { type: 'lead_step', step: 'phone', email: inp }
      };
    }

    if (step === 'phone') {
      const skipped = /^(skip|no|nahi|nope|na|pass)$/i.test(inp);
      const phone = skipped ? '' : inp;
      if (!skipped) {
        const cleaned = inp.replace(/[\s\-().+]/g,'');
        if (!/^\d{7,15}$/.test(cleaned)) {
          return { text: '❗ ' + L.askPhone, provider: 'local', action: { type: 'lead_step', step: 'phone', error: true } };
        }
      }
      const lang = meta.lang || 'en';
      const confirmMsg = lang === 'hi'
        ? `✅ शुक्रिया! हमारी टीम जल्द आपसे संपर्क करेगी।\n\nक्या आप कुछ और जानना चाहते हैं?`
        : `✅ Thank you! Our team will contact you shortly.\n\nIs there anything else you'd like to know?`;
      return {
        text: confirmMsg,
        provider: 'local',
        action: { type: 'lead_complete', phone }
      };
    }

    return { text: L.fallback, provider: 'local', action: null };
  }

  // ── Language selection message ─────────────────────────────────────────────
  _langSelectionMsg(botName) {
    return `👋 Welcome! I'm ${botName}.\n\nPlease select your language:\n\n1️⃣ English\n2️⃣ हिंदी (Hindi)\n3️⃣ मराठी (Marathi)\n4️⃣ ગુજરાતી (Gujarati)\n5️⃣ தமிழ் (Tamil)\n6️⃣ తెలుగు (Telugu)\n\n_Type the number or language name_`;
  }

  _parseLangSelection(q) {
    const ql = q.toLowerCase().trim();
    const map = {
      '1': 'en', 'english': 'en', 'eng': 'en',
      '2': 'hi', 'hindi': 'hi', 'हिंदी': 'hi', 'हिन्दी': 'hi',
      '3': 'mr', 'marathi': 'mr', 'मराठी': 'mr',
      '4': 'gu', 'gujarati': 'gu', ' gujarathi': 'gu', 'ગુજરાતી': 'gu',
      '5': 'ta', 'tamil': 'ta', 'தமிழ்': 'ta',
      '6': 'te', 'telugu': 'te', 'తెలుగు': 'te'
    };
    return map[ql] || null;
  }

  // ── Language detection from text ──────────────────────────────────────────
  _detectLang(text, history = []) {
    // Check history for language already set
    const allText = (history.map(h => h.content || '').join(' ') + ' ' + text).toLowerCase();

    // Hindi script
    if (/[\u0900-\u097F]/.test(text)) return 'hi';
    // Tamil script
    if (/[\u0B80-\u0BFF]/.test(text)) return 'ta';
    // Telugu script
    if (/[\u0C00-\u0C7F]/.test(text)) return 'te';
    // Gujarati script
    if (/[\u0A80-\u0AFF]/.test(text)) return 'gu';
    // Marathi (same script as Hindi but detect keywords)
    if (/\b(आहे|आहेत|मला|तुम्ही|काय|नाही|कसे)\b/.test(text)) return 'mr';

    // Roman Hindi/Hinglish
    if (/\b(kya|kaise|kahan|mujhe|aapka|chahiye|batao|hai|hain|nahi|kar|mere|meri|yeh|woh)\b/.test(allText)) return 'hi';

    return 'en';
  }

  // ── Intent Detection ─────────────────────────────────────────────────────
  _detectIntent(ql) {
    const booking = ['book','booking','schedule','appointment','demo','callback','call back','call me','consultation','quote','quotation','estimate','order','buy','purchase','service chahiye','shifting','enroll','register','hire','want service','need service','interested','book karna','booking chahiye'];
    if (booking.some(w => ql.includes(w))) return 'booking';

    const support = ['problem','issue','error','not working','broken','fix','complaint','refund','cancel','login','password','nahi mila','payment','charge','invoice','help','support','order nahi','stuck','not received','delay'];
    if (support.some(w => ql.includes(w))) return 'support';

    const pricing = ['price','pricing','cost','fee','rate','charge','plan','package','how much','kitna','fees','tariff','subscription','monthly','yearly','discount','per month'];
    if (pricing.some(w => ql.includes(w))) return 'pricing';

    const location = ['address','location','office','where','kahan','near','map','directions','city','area','branch','visit','jagah'];
    if (location.some(w => ql.includes(w))) return 'location';

    const contact = ['contact','phone','number','email','mail','reach','whatsapp','telegram','call','message','get in touch','sampark'];
    if (contact.some(w => ql.includes(w))) return 'contact';

    return 'info';
  }

  // ── Smart RAG answer builder ──────────────────────────────────────────────
  _buildSmartAnswer(original, ql, chunks, intent, L) {
    const keywords = this._keywords(ql);
    const terms = keywords.length > 0 ? keywords : ql.split(/\s+/).filter(w => w.length > 2);

    const scored = chunks.map(c => {
      const cl = c.content.toLowerCase();
      let s = 0;
      if (cl.includes(ql)) s += 80;
      for (const ph of ql.split(/[,?.!]+/).filter(p => p.trim().length > 4)) {
        if (cl.includes(ph.trim())) s += 25;
      }
      for (const w of terms) {
        const cnt = (cl.match(new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'g'))||[]).length;
        s += cnt * (w.length > 5 ? 4 : 2);
      }
      if (terms.length > 1) { let f=0; for (const w of terms) if (cl.includes(w)) f++; s += f*6; }
      return { c, s };
    }).filter(x => x.s > 0).sort((a,b) => b.s-a.s);

    const top = scored.length > 0 ? scored.slice(0,3).map(x=>x.c) : chunks.slice(0,2);
    const combined = top.map(c=>c.content).join(' ');
    const sents = combined.split(/[.!?]+/).map(s=>s.replace(/\s+/g,' ').trim()).filter(s=>s.length>15);

    const relevant = sents.map(s => {
      let sc=0; const sl=s.toLowerCase();
      for (const w of terms) if (sl.includes(w)) sc+=w.length;
      return { s, sc };
    }).filter(x=>x.sc>0).sort((a,b)=>b.sc-a.sc).slice(0,3).map(x=>x.s);

    const raw = relevant.length>0 ? relevant.join('. ') : sents.slice(0,2).join('. ');
    if (!raw || raw.length < 10) return L.noInfo;

    let ans = raw.replace(/\s+/g,' ').trim();
    if (!/[.!?]$/.test(ans)) ans += '.';

    // CTA by intent
    const ctas = { booking: L.bookingCta, pricing: L.pricingCta, support: L.supportCta };
    if (ctas[intent]) ans += ctas[intent];

    return ans;
  }

  _noKnowledgeReply(intent, L, botName) {
    if (intent==='booking') return `${L.greeting.replace('{bot}',botName)}\n\n${L.askName}`;
    if (intent==='support') return L.supportCta.trim() || L.noInfo;
    return L.noInfo;
  }

  _isGreeting(q) {
    return ['hi','hello','hey','hii','namaste','namaskar','sup','howdy','good morning','good evening','good afternoon','hy','helo','hiii','नमस्ते','नमस्कार'].some(w => q===w || q.startsWith(w+' ') || q.startsWith(w+'!'));
  }
  _isFarewell(q) { return ['bye','goodbye','ok bye','see you','cya','tata','alvida','thank you bye'].some(w=>q.includes(w)); }
  _isThanks(q) { return ['thanks','thank you','thankyou','thx','shukriya','dhanyawad','धन्यवाद','शुक्रिया'].some(w=>q===w||q.startsWith(w+' ')); }

  _keywords(text) {
    const stop = new Set(['what','is','are','the','a','an','how','do','does','can','i','you','we','they','me','my','our','your','in','on','at','to','for','of','and','or','but','with','this','that','it','be','was','were','have','has','will','would','could','should','may','might','just','more','some','any','all','also','so','if','then','than','when','where','who','which','much','many','very','too','not','no','yes','hi','hello','hey','get','make','use','let','about','tell','please','know','want','need','give']);
    return text.toLowerCase().replace(/[^\w\s]/g,' ').split(/\s+/).filter(w=>w.length>1&&!stop.has(w));
  }

  _extractBotName(sp) {
    if (!sp) return 'AI Assistant';
    const m = sp.match(/(?:you are|i am|my name is|named?)\s+([A-Z][a-zA-Z\s]{1,20})/i);
    return m ? m[1].trim() : 'AI Assistant';
  }
}

module.exports = new AIService();
