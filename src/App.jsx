import React, { useState, useEffect } from 'react';

// Your Cloudflare Worker URL — the proxy that hides your API key
const API_URL = 'https://tproxy.troykeur.workers.dev';

// === Scripture hero rotation — full canon, modern translation phrasing ===
const HERO_SCRIPTURES = [
  // Gospels (Jesus's own words)
  { text: 'Come to me, all who are weary.', ref: 'Matthew 11:28' },
  { text: 'Let not your heart be troubled.', ref: 'John 14:1' },
  { text: 'I am the light of the world.', ref: 'John 8:12' },
  { text: 'Peace I leave with you.', ref: 'John 14:27' },
  { text: 'I am with you always.', ref: 'Matthew 28:20' },
  { text: 'Ask, and it will be given to you.', ref: 'Matthew 7:7' },
  { text: 'Blessed are the pure in heart.', ref: 'Matthew 5:8' },
  // Psalms — the prayer book of the Bible
  { text: 'The Lord is my shepherd; I shall not want.', ref: 'Psalm 23:1' },
  { text: 'Be still, and know that I am God.', ref: 'Psalm 46:10' },
  { text: 'The Lord is my light and my salvation.', ref: 'Psalm 27:1' },
  { text: 'You are with me.', ref: 'Psalm 23:4' },
  { text: 'This is the day the Lord has made.', ref: 'Psalm 118:24' },
  // Wisdom & Prophets
  { text: 'He gives strength to the weary.', ref: 'Isaiah 40:29' },
  { text: 'I have loved you with an everlasting love.', ref: 'Jeremiah 31:3' },
  { text: 'Trust in the Lord with all your heart.', ref: 'Proverbs 3:5' },
  { text: 'For everything there is a season.', ref: 'Ecclesiastes 3:1' },
  // Epistles
  { text: 'Do not be anxious about anything.', ref: 'Philippians 4:6' },
  { text: 'Cast all your anxieties on him.', ref: '1 Peter 5:7' },
  { text: 'Love is patient, love is kind.', ref: '1 Corinthians 13:4' },
  { text: 'Behold, I make all things new.', ref: 'Revelation 21:5' },
];

// === PHASE 1 AMBITIOUS: Haptic language ===
// Very short, gentle patterns. Silent on desktop; subtle on phones that support it.
const haptics = {
  select: () => { try { navigator.vibrate?.(12); } catch {} },
  receive: () => { try { navigator.vibrate?.([28, 60, 28, 60, 28]); } catch {} },
  open: () => { try { navigator.vibrate?.(20); } catch {} },
  close: () => { try { navigator.vibrate?.(8); } catch {} },
};

// LocalStorage wrapper (replaces the artifact's window.storage API)
const storage = {
  list: async (prefix) => {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(prefix)) keys.push(k);
    }
    return { keys };
  },
  get: async (key) => {
    const value = localStorage.getItem(key);
    return value ? { value } : null;
  },
  set: async (key, value) => {
    try {
      localStorage.setItem(key, value);
      return { key, value };
    } catch (e) {
      console.warn('Storage write failed (likely quota exceeded):', e);
      throw e;
    }
  },
  delete: async (key) => {
    localStorage.removeItem(key);
    return { key, deleted: true };
  },
};

// Generate a unique ID safely (crypto.randomUUID where available; fallback otherwise)
const makeId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return Date.now().toString() + '-' + Math.random().toString(36).slice(2, 10);
};

// Extract JSON from a string that may have preamble/postamble
const extractJSON = (text) => {
  const cleaned = text.replace(/```json|```/g, '').trim();
  try { return JSON.parse(cleaned); } catch (e) {}
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (match) {
    try { return JSON.parse(match[0]); } catch (e) {}
  }
  throw new Error('Could not parse JSON from response');
};

// Sanitize SVG: strip <script>, on* event handlers, javascript: URIs
const sanitizeSVG = (svg) => {
  if (typeof svg !== 'string') return '';
  return svg
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son\w+\s*=\s*'[^']*'/gi, '')
    .replace(/javascript\s*:/gi, '');
};

// Fetch with one automatic retry on 5xx errors
const fetchWithRetry = async (url, options, retries = 1) => {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, options);
      if (response.status >= 500 && response.status < 600 && attempt < retries) {
        await new Promise(r => setTimeout(r, 800 * (attempt + 1)));
        continue;
      }
      return response;
    } catch (err) {
      if (attempt >= retries) throw err;
      await new Promise(r => setTimeout(r, 800 * (attempt + 1)));
    }
  }
};

// Cap stored entries at this many; evict oldest when over
const MAX_STORED_ENTRIES = 100;

// === PHASE 2: Illuminated glyphs — hand-crafted SVGs for each mood ===
// Consistent style: thin gold linework, symbolic rather than literal, 64x64 viewBox
const GLYPHS = {
  anxiety: (
    // Restless waves — ripples on troubled water
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
      <path d="M6 26 Q14 20 22 26 T38 26 T54 26 T58 26" stroke="#f0c060" strokeWidth="1.4" fill="none" strokeLinecap="round" opacity="0.85"/>
      <path d="M6 36 Q14 30 22 36 T38 36 T54 36 T58 36" stroke="#f0c060" strokeWidth="1.4" fill="none" strokeLinecap="round"/>
      <path d="M6 46 Q14 40 22 46 T38 46 T54 46 T58 46" stroke="#f0c060" strokeWidth="1.4" fill="none" strokeLinecap="round" opacity="0.7"/>
      <circle cx="32" cy="14" r="1.5" fill="#f0c060" opacity="0.9"/>
    </svg>
  ),
  grief: (
    // A candle bent, flame nearly out — grief as an extinguished light
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
      <path d="M32 50 L32 24" stroke="#f0c060" strokeWidth="1.6" strokeLinecap="round"/>
      <path d="M28 50 L36 50" stroke="#f0c060" strokeWidth="1.6" strokeLinecap="round"/>
      <path d="M32 24 Q30 20 32 16 Q34 20 32 24 Z" stroke="#f0c060" strokeWidth="1.2" fill="#f0c060" fillOpacity="0.3"/>
      <path d="M35 26 Q40 27 42 30" stroke="#f0c060" strokeWidth="1" fill="none" strokeLinecap="round" opacity="0.6"/>
      <path d="M37 32 Q41 33 43 35" stroke="#f0c060" strokeWidth="1" fill="none" strokeLinecap="round" opacity="0.5"/>
    </svg>
  ),
  gratitude: (
    // Open palm receiving light from above — simplified, clearer palm shape
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
      {/* Light source above */}
      <circle cx="32" cy="12" r="3" fill="#f0c060" opacity="0.95"/>
      {/* Radiating light lines */}
      <path d="M32 4 L32 8" stroke="#f0c060" strokeWidth="1" strokeLinecap="round" opacity="0.7"/>
      <path d="M24 8 L26 12" stroke="#f0c060" strokeWidth="1" strokeLinecap="round" opacity="0.6"/>
      <path d="M40 8 L38 12" stroke="#f0c060" strokeWidth="1" strokeLinecap="round" opacity="0.6"/>
      <path d="M32 18 L32 24" stroke="#f0c060" strokeWidth="0.8" strokeLinecap="round" opacity="0.5"/>
      {/* Open palm — clear cup shape with fingers */}
      {/* Palm bowl */}
      <path d="M18 36 Q18 48 32 52 Q46 48 46 36" stroke="#f0c060" strokeWidth="1.6" fill="none" strokeLinecap="round"/>
      {/* Wrist */}
      <path d="M24 52 L26 58 M40 52 L38 58" stroke="#f0c060" strokeWidth="1.2" strokeLinecap="round"/>
      {/* Fingers reaching up */}
      <path d="M18 36 L18 26" stroke="#f0c060" strokeWidth="1.4" strokeLinecap="round"/>
      <path d="M24 34 L24 22" stroke="#f0c060" strokeWidth="1.4" strokeLinecap="round"/>
      <path d="M32 34 L32 22" stroke="#f0c060" strokeWidth="1.4" strokeLinecap="round"/>
      <path d="M40 34 L40 22" stroke="#f0c060" strokeWidth="1.4" strokeLinecap="round"/>
      <path d="M46 36 L46 28" stroke="#f0c060" strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  ),
  doubt: (
    // Fork in a path — which way? The visual language of doubt.
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
      {/* Question mark / questioning presence above */}
      <circle cx="32" cy="12" r="2" fill="#f0c060" opacity="0.9"/>
      <path d="M28 8 Q28 4 32 4 Q36 4 36 8 Q36 10 32 12" stroke="#f0c060" strokeWidth="1.4" fill="none" strokeLinecap="round" opacity="0.8"/>
      {/* Main path coming up */}
      <path d="M32 58 L32 40" stroke="#f0c060" strokeWidth="2" strokeLinecap="round"/>
      {/* Left fork */}
      <path d="M32 40 Q28 32 18 24" stroke="#f0c060" strokeWidth="1.8" fill="none" strokeLinecap="round"/>
      {/* Right fork */}
      <path d="M32 40 Q36 32 46 24" stroke="#f0c060" strokeWidth="1.8" fill="none" strokeLinecap="round"/>
      {/* Small stones / markers along paths */}
      <circle cx="20" cy="26" r="1.2" fill="#f0c060" opacity="0.55"/>
      <circle cx="44" cy="26" r="1.2" fill="#f0c060" opacity="0.55"/>
      {/* Ground line at bottom */}
      <path d="M20 60 L44 60" stroke="#f0c060" strokeWidth="0.8" strokeLinecap="round" opacity="0.4"/>
    </svg>
  ),
  forgiveness: (
    // Two hands meeting — reconciliation
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
      <path d="M8 40 Q14 32 22 30 L28 34 L26 40 L20 44 L14 44 Z" stroke="#f0c060" strokeWidth="1.3" fill="none" strokeLinejoin="round"/>
      <path d="M56 40 Q50 32 42 30 L36 34 L38 40 L44 44 L50 44 Z" stroke="#f0c060" strokeWidth="1.3" fill="none" strokeLinejoin="round"/>
      <path d="M26 36 L38 36" stroke="#f0c060" strokeWidth="1.5" strokeLinecap="round"/>
      <circle cx="32" cy="20" r="2" fill="#f0c060" opacity="0.9"/>
      <path d="M32 22 L32 30" stroke="#f0c060" strokeWidth="0.8" opacity="0.5"/>
    </svg>
  ),
  anger: (
    // Lightning-struck tree — passion that consumes
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
      <path d="M32 8 L28 22 L34 22 L30 34 L36 34 L32 46" stroke="#f0c060" strokeWidth="1.6" fill="none" strokeLinejoin="round" strokeLinecap="round"/>
      <path d="M22 46 Q26 44 32 46 Q38 44 42 46" stroke="#f0c060" strokeWidth="1.2" fill="none" strokeLinecap="round"/>
      <path d="M32 46 L32 56" stroke="#f0c060" strokeWidth="1.6" strokeLinecap="round"/>
      <path d="M18 50 L24 48" stroke="#f0c060" strokeWidth="0.8" opacity="0.6"/>
      <path d="M46 50 L40 48" stroke="#f0c060" strokeWidth="0.8" opacity="0.6"/>
    </svg>
  ),
  lonely: (
    // Single lit window in a dark tower
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
      <rect x="22" y="10" width="20" height="46" stroke="#f0c060" strokeWidth="1.4" fill="none"/>
      <path d="M22 18 L42 18" stroke="#f0c060" strokeWidth="1"/>
      <rect x="28" y="24" width="8" height="12" stroke="#f0c060" strokeWidth="1.2" fill="#f0c060" fillOpacity="0.4"/>
      <path d="M32 24 L32 36 M28 30 L36 30" stroke="#08061a" strokeWidth="0.8"/>
      <path d="M22 42 L42 42" stroke="#f0c060" strokeWidth="0.6" opacity="0.5"/>
      <path d="M22 50 L42 50" stroke="#f0c060" strokeWidth="0.6" opacity="0.5"/>
    </svg>
  ),
  lost: (
    // Lantern held forward on a path
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
      <rect x="24" y="18" width="16" height="20" stroke="#f0c060" strokeWidth="1.4" fill="none"/>
      <path d="M28 18 L28 14 Q28 12 32 12 Q36 12 36 14 L36 18" stroke="#f0c060" strokeWidth="1.2" fill="none"/>
      <circle cx="32" cy="28" r="4" fill="#f0c060" opacity="0.6"/>
      <path d="M24 38 L20 44 M40 38 L44 44" stroke="#f0c060" strokeWidth="0.8" opacity="0.5"/>
      <path d="M18 50 Q32 46 46 50" stroke="#f0c060" strokeWidth="1.2" fill="none" strokeLinecap="round"/>
      <path d="M14 56 Q32 52 50 56" stroke="#f0c060" strokeWidth="0.8" fill="none" strokeLinecap="round" opacity="0.5"/>
    </svg>
  ),
  tempted: (
    // Fruit on a branch — Eden motif
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
      <path d="M10 14 Q20 20 32 22 Q44 24 54 20" stroke="#f0c060" strokeWidth="1.4" fill="none" strokeLinecap="round"/>
      <path d="M18 16 L14 12 M24 18 L20 14 M40 22 L36 18 M48 20 L44 16" stroke="#f0c060" strokeWidth="0.8" strokeLinecap="round" opacity="0.6"/>
      <circle cx="32" cy="38" r="10" stroke="#f0c060" strokeWidth="1.6" fill="#f0c060" fillOpacity="0.3"/>
      <path d="M32 28 L32 22" stroke="#f0c060" strokeWidth="1.2" strokeLinecap="round"/>
      <path d="M32 28 Q36 26 38 22" stroke="#f0c060" strokeWidth="1" fill="none" strokeLinecap="round"/>
      <path d="M28 34 Q30 32 32 34" stroke="#f0c060" strokeWidth="0.8" fill="none" opacity="0.6"/>
    </svg>
  ),
  joy: (
    // Rising dove with rays
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
      <path d="M20 40 Q24 30 32 28 Q40 26 44 32 Q46 34 42 36 L36 34 Q32 34 30 38 Q28 42 32 44 L28 46 Q22 46 20 40 Z" stroke="#f0c060" strokeWidth="1.4" fill="#f0c060" fillOpacity="0.25" strokeLinejoin="round"/>
      <path d="M44 30 L48 26" stroke="#f0c060" strokeWidth="1" strokeLinecap="round"/>
      <circle cx="42" cy="30" r="0.8" fill="#f0c060"/>
      <path d="M32 14 L32 22 M22 18 L26 22 M42 18 L38 22 M14 22 L18 24 M50 22 L46 24" stroke="#f0c060" strokeWidth="0.8" strokeLinecap="round" opacity="0.6"/>
    </svg>
  ),
  humble: (
    // Empty vessel — kenosis, self-emptying
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
      <path d="M20 22 L44 22 L42 26 L44 42 Q44 50 32 52 Q20 50 20 42 L22 26 Z" stroke="#f0c060" strokeWidth="1.4" fill="none" strokeLinejoin="round"/>
      <path d="M20 22 L18 18 M44 22 L46 18" stroke="#f0c060" strokeWidth="1" strokeLinecap="round"/>
      <path d="M22 30 L42 30" stroke="#f0c060" strokeWidth="0.8" opacity="0.5"/>
      <circle cx="32" cy="14" r="1.5" fill="#f0c060" opacity="0.7"/>
      <path d="M32 16 L32 22" stroke="#f0c060" strokeWidth="0.6" opacity="0.4"/>
    </svg>
  ),
  love: (
    // Heart with cross inside — sacred love
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
      <path d="M32 52 Q10 38 10 24 Q10 14 20 14 Q28 14 32 22 Q36 14 44 14 Q54 14 54 24 Q54 38 32 52 Z" stroke="#f0c060" strokeWidth="1.6" fill="#f0c060" fillOpacity="0.2" strokeLinejoin="round"/>
      <path d="M32 22 L32 40 M24 30 L40 30" stroke="#f0c060" strokeWidth="1.6" strokeLinecap="round"/>
    </svg>
  ),
};

// Each mood gets a jewel tone (the color of its stained-glass panel)
const MOODS = [
  { id: 'anxiety', label: 'Anxious', icon: '◐', jewel: '#3a5f8a', glow: '#6b9dd9',
    subs: ['the future', 'finances', 'health', 'a relationship', 'failure', 'change'] },
  { id: 'grief', label: 'Grieving', icon: '✟', jewel: '#5a3a5a', glow: '#a87cb0',
    subs: ['loss of someone', 'a broken relationship', 'lost dreams', 'physical suffering', 'feeling abandoned'] },
  { id: 'gratitude', label: 'Grateful', icon: '✦', jewel: '#8a6a2a', glow: '#d9b35a',
    subs: ['for a blessing', 'for people in my life', 'for healing', 'for small things', 'for being held'] },
  { id: 'doubt', label: 'Doubting', icon: '?', jewel: '#3a5a5a', glow: '#6ba0a0',
    subs: ['my faith', "God's presence", 'my path', 'prayer', 'whether I am loved'] },
  { id: 'forgiveness', label: 'Forgiveness', icon: '☩', jewel: '#7a3a3a', glow: '#c47070',
    subs: ['for hurting someone', 'for myself', 'to forgive another', 'past mistakes', 'falling short'] },
  { id: 'anger', label: 'Angry', icon: '⚡', jewel: '#8a2a2a', glow: '#d44a4a',
    subs: ['at injustice', 'at someone close', 'at myself', 'at God', 'at circumstance'] },
  { id: 'lonely', label: 'Lonely', icon: '☾', jewel: '#3a3a6a', glow: '#7878c4',
    subs: ['feeling unseen', 'feeling unloved', 'in a crowd', 'spiritually alone', 'far from loved ones'] },
  { id: 'lost', label: 'Searching', icon: '✧', jewel: '#3a6a4a', glow: '#6ab088',
    subs: ['for purpose', 'for direction', 'for meaning', 'for truth', 'for my next step'] },
  { id: 'tempted', label: 'Tempted', icon: '◈', jewel: '#5a3a2a', glow: '#a87a5a',
    subs: ['by anger', 'by pride', 'by greed', 'by lust', 'by despair', 'to give up'] },
  { id: 'joy', label: 'Joyful', icon: '☼', jewel: '#a87020', glow: '#f0c060',
    subs: ['from love', 'from purpose', 'from a new beginning', 'from peace', 'from grace'] },
  { id: 'humble', label: 'Humble', icon: '◊', jewel: '#4a5a3a', glow: '#8ca070',
    subs: ['to serve others', 'to listen', 'to release control', 'to let go of pride', 'to accept help'] },
  { id: 'love', label: 'Love', icon: '♡', jewel: '#7a2a4a', glow: '#c45a80',
    subs: ['for an enemy', 'for a stranger', 'for myself', 'in marriage', 'for the broken', 'unconditional'] },
];

export default function App() {
  const [step, setStep] = useState('home');
  const [input, setInput] = useState('');
  const [selections, setSelections] = useState(new Set());
  const [activePanels, setActivePanels] = useState(new Set());
  const [response, setResponse] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [history, setHistory] = useState([]);
  const [view, setView] = useState('main');
  const [usedReferences, setUsedReferences] = useState(new Set());
  const [imagePreview, setImagePreview] = useState(null);

  // New state for enhancements
  const [favorites, setFavorites] = useState(new Set()); // entry IDs marked as favorite
  const [historyFilter, setHistoryFilter] = useState('all'); // 'all' | 'favorites'
  const [historySearch, setHistorySearch] = useState('');
  const [reflection, setReflection] = useState(''); // current reflection text
  const [showDailyPrompt, setShowDailyPrompt] = useState(false);
  const [readingAloud, setReadingAloud] = useState(false);

  // === PHASE 1 AMBITIOUS: New state ===
  const [heroIndex] = useState(() => Math.floor(Math.random() * HERO_SCRIPTURES.length));
  const [closingMoment, setClosingMoment] = useState(false); // "Go in peace" overlay
  const [revealStage, setRevealStage] = useState(0); // 0..4 for staggered response reveal

  // === PHASE 2: Opening ceremony ===
  const [openingCeremony, setOpeningCeremony] = useState(null); // null | 'first' | 'brief'
  const [ceremonyStage, setCeremonyStage] = useState(0); // for staged reveal within ceremony

  // In-app toast (used instead of alert/prompt to preserve aesthetic)
  const [toast, setToast] = useState(null);
  const showToast = (message) => {
    setToast(message);
    setTimeout(() => setToast(null), 2600);
  };

  useEffect(() => {
    const timers = [];
    (async () => {
      try {
        const result = await storage.list('entry:');
        if (result && result.keys && result.keys.length) {
          const entries = [];
          const refs = new Set();
          for (const key of result.keys) {
            try {
              const item = await storage.get(key);
              if (item && item.value) {
                const parsed = JSON.parse(item.value);
                entries.push(parsed);
                if (parsed.quotes) parsed.quotes.forEach(q => refs.add(q.reference));
              }
            } catch (e) { console.warn('Skipped corrupt entry:', key, e); }
          }
          entries.sort((a, b) => b.timestamp - a.timestamp);
          setHistory(entries);
          setUsedReferences(refs);
        }

        // Load favorites
        const favItem = await storage.get('favorites');
        if (favItem && favItem.value) {
          try { setFavorites(new Set(JSON.parse(favItem.value))); } catch (e) {}
        }

        // Check daily prompt — show if user hasn't seen one today
        const lastPromptItem = await storage.get('lastDailyPrompt');
        const today = new Date().toDateString();
        if (!lastPromptItem || lastPromptItem.value !== today) {
          // Only show after a small delay so it doesn't blast on first load
          timers.push(setTimeout(() => setShowDailyPrompt(true), 1500));
        }

        // === PHASE 2: Opening ceremony ===
        // First visit ever = full ceremony (12s). Every subsequent session = brief (3s).
        const hasSeenCeremony = await storage.get('hasSeenCeremony');
        const sessionKey = 'ceremonyThisSession';
        const seenThisSession = sessionStorage.getItem(sessionKey);
        if (!hasSeenCeremony) {
          setOpeningCeremony('first');
          setCeremonyStage(0);
          timers.push(setTimeout(() => setCeremonyStage(1), 800));
          timers.push(setTimeout(() => setCeremonyStage(2), 3200));
          timers.push(setTimeout(() => setCeremonyStage(3), 6800));
          timers.push(setTimeout(() => setCeremonyStage(4), 11500));
          timers.push(setTimeout(async () => {
            setOpeningCeremony(null);
            try { await storage.set('hasSeenCeremony', 'true'); } catch {}
            sessionStorage.setItem(sessionKey, '1');
          }, 13500));
        } else if (!seenThisSession) {
          setOpeningCeremony('brief');
          setCeremonyStage(1);
          timers.push(setTimeout(() => setCeremonyStage(4), 2400));
          timers.push(setTimeout(() => {
            setOpeningCeremony(null);
            sessionStorage.setItem(sessionKey, '1');
          }, 3400));
        }
      } catch (e) { console.warn('Initial load failed:', e); }
    })();

    // Cleanup: cancel timers and speech synthesis
    return () => {
      timers.forEach(clearTimeout);
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const dismissDailyPrompt = async () => {
    setShowDailyPrompt(false);
    try { await storage.set('lastDailyPrompt', new Date().toDateString()); } catch (e) {}
  };

  // If user navigates back to a response after the reveal would have completed,
  // snap it to the final state instead of leaving them frozen mid-reveal.
  useEffect(() => {
    if (step === 'response' && view === 'main' && response?.revealedAt) {
      const elapsed = Date.now() - response.revealedAt;
      if (elapsed > 7500 && revealStage < 4) {
        setRevealStage(4);
      }
    }
  }, [step, view, response, revealStage]);

  const togglePanel = (moodId) => {
    setActivePanels(prev => {
      const next = new Set(prev);
      if (next.has(moodId)) next.delete(moodId);
      else next.add(moodId);
      return next;
    });
  };

  const toggleSelection = (key) => {
    haptics.select();
    setSelections(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const countMoodSelections = (moodId) => {
    let count = 0;
    for (const sel of selections) {
      if (sel === moodId || sel.startsWith(moodId + ':')) count++;
    }
    return count;
  };

  const restart = () => {
    const clearState = () => {
      setInput('');
      setSelections(new Set());
      setActivePanels(new Set());
      setResponse(null);
      setError(null);
      setStep('home');
      setRevealStage(0);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    // "Go in peace" closing overlay only when leaving a received word
    if (response) {
      setClosingMoment(true);
      haptics.close();
      setTimeout(() => {
        clearState();
        setClosingMoment(false);
      }, 2400);
      return;
    }
    clearState();
  };

  const handleSubmit = async () => {
    if (!input.trim() && selections.size === 0) return;
    setLoading(true);
    setError(null);
    setResponse(null);

    const feelingsByMood = {};
    selections.forEach(sel => {
      const [moodId, sub] = sel.split(':');
      if (!feelingsByMood[moodId]) feelingsByMood[moodId] = [];
      if (sub) feelingsByMood[moodId].push(sub);
    });

    const feelingsParts = Object.entries(feelingsByMood).map(([moodId, subs]) => {
      const mood = MOODS.find(m => m.id === moodId);
      if (!mood) return null;
      if (subs.length === 0) return mood.label.toLowerCase();
      const subList = subs.length === 1 ? subs[0] : subs.slice(0, -1).join(', ') + ' and ' + subs.slice(-1);
      return `${mood.label.toLowerCase()} (about ${subList})`;
    }).filter(Boolean);

    const feelingsText = feelingsParts.length ? feelingsParts.join('; ') : null;
    const userContext = [
      feelingsText && `Feeling: ${feelingsText}`,
      input.trim() && `Their words: "${input.trim()}"`
    ].filter(Boolean).join('\n');

    const avoidList = Array.from(usedReferences).slice(-20).join(', ');

    try {
      const apiResponse = await fetchWithRetry(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-opus-4-8",
          max_tokens: 4000,
          thinking: { type: "adaptive" },
          effort: "high",
          messages: [{
            role: "user",
            content: `A person has come with this:

${userContext}

Provide spiritual counsel drawn from Scripture. Include 3-4 quotes total, ranging across the whole Bible as most fitting for what they've brought.

**CRITICAL: Scripture accuracy is the highest priority.**
- Every quote must be a REAL Bible verse — never invented, never a paraphrase presented as a quote.
- The wording must match what appears in a widely-used modern translation (NIV, NRSV, ESV, NLT, CSB).
- Before finalizing your response, verify each quote:
  1. Does this passage actually exist at the reference cited?
  2. Does the wording accurately reflect the source in a modern translation?
  3. Is the meaning I'm ascribing to it consistent with its actual context?
- If you have ANY uncertainty about whether a quote is verbatim accurate, DO NOT include it — choose a different verse you're certain about. Quality over quantity: 2 accurate quotes is far better than 4 uncertain ones.

**Sources to draw from:**
- **Old Testament**: Psalms (for lament, comfort, praise), Proverbs (for wisdom), Isaiah, Jeremiah, Lamentations (for hope and honest sorrow), Ecclesiastes and Job (for the hard human questions), Genesis, Exodus, Ruth, and other narrative or prophetic passages
- **Gospels**: Jesus's own words — sayings, parables, the Sermon on the Mount, the Beatitudes, conversations with disciples
- **New Testament letters and other writings**: Paul (Romans, Corinthians, Galatians, Ephesians, Philippians, Colossians, Thessalonians, Timothy, Titus, Philemon), Peter (1 & 2 Peter), James, John (1, 2, 3 John), Jude, Hebrews, Acts, Revelation

**Guidelines:**
- Ideally include AT LEAST ONE quote from Jesus himself when it fits naturally, since his voice is the pastoral center of this app. But if another passage speaks more directly to the person's need, honor that.
- Range widely — don't default to the same handful of familiar verses. Let the Psalms speak when someone grieves, let Proverbs speak when someone is confused, let Isaiah speak when someone needs hope.
- Use MODERN translation phrasing (NIV, NRSV, ESV, or NLT style) — accessible, warm, contemporary English. Avoid archaic "thee/thou/thy" wording.
- Do NOT invent quotes. Only use actual recorded scripture.

**Avoid these references already used:** ${avoidList || 'none yet'}

**Format the speaker correctly:**
- For Jesus's words, set "speaker" to "Jesus"
- For Psalms, use "the Psalmist" or "David" if traditionally attributed
- For prophets, use their name ("Isaiah", "Jeremiah")
- For epistles, use the writer's name ("Paul", "Peter", "James", "John", "the author of Hebrews")
- For wisdom books, use "the Preacher" (Ecclesiastes), "Solomon" or "the sages" (Proverbs), "Job"

**The FINAL response must be in Jesus's voice** — a gentle pastoral word as if Jesus himself is speaking directly to this person. It may echo or extend the themes from the other quotes, but the voice and authority is his. This is the heart of the app.

Return ONLY a JSON object (no markdown, no code fences):

{
  "quotes": [
    {
      "text": "the actual quote in modern translation",
      "reference": "Book Chapter:Verse",
      "speaker": "Jesus" or "the Psalmist" or "Paul" etc.,
      "context": "one short sentence on what was happening or the situation of the writing"
    }
  ],
  "response": "a gentle pastoral response in Jesus's voice, 3-5 sentences, speaking directly to the person",
  "theme": "2-4 visual keywords"
}

Order quotes thoughtfully — often it's powerful to lead with a voice that names the person's condition (a Psalm of lament, a proverb, an apostle's counsel), then let Jesus's words land near the end, before his final pastoral response.`
          }]
        })
      });

      if (!apiResponse.ok) {
        const errBody = await apiResponse.json().catch(() => ({}));
        // Extract a useful message from possibly-nested error objects
        const rawErr = errBody.error;
        const errMsg = typeof rawErr === 'string' ? rawErr
                     : (rawErr && rawErr.message) ? rawErr.message
                     : errBody.detail || errBody.message || '';
        if (apiResponse.status === 429) {
          throw new Error('Too many requests right now. Please wait a moment and try again.');
        }
        if (apiResponse.status === 400) {
          throw new Error(errMsg || 'Request was rejected. Please try again.');
        }
        if (apiResponse.status === 502) {
          throw new Error('Could not reach the scripture service. Please try again in a moment.');
        }
        throw new Error(errMsg || `Request failed (${apiResponse.status})`);
      }

      const data = await apiResponse.json();
      const text = data.content.filter(b => b.type === "text").map(b => b.text).join("\n");
      const parsed = extractJSON(text);

      if (!parsed.quotes || !Array.isArray(parsed.quotes) || !parsed.response) {
        throw new Error('Response was malformed. Please try again.');
      }

      const entry = {
        id: makeId(),
        timestamp: Date.now(),
        input: input.trim(),
        mood: feelingsText,
        illustration: null,
        ...parsed
      };

      // Brief reverent transition before showing
      await new Promise(r => setTimeout(r, 600));
      const entryWithTiming = { ...entry, revealedAt: Date.now() };
      setResponse(entryWithTiming);
      setStep('response');
      setReflection(entryWithTiming.reflection || ''); // load any existing reflection
      window.scrollTo({ top: 0, behavior: 'smooth' });
      haptics.receive();

      // Staggered reveal: illustration (0), quote1 (2s), quote2 (3.5s), quote3 (5s), pastoral (6.5s)
      setRevealStage(0);
      setTimeout(() => setRevealStage(1), 2000);
      setTimeout(() => setRevealStage(2), 3500);
      setTimeout(() => setRevealStage(3), 5000);
      setTimeout(() => setRevealStage(4), 6500);

      const newRefs = new Set(usedReferences);
      if (parsed.quotes) parsed.quotes.forEach(q => newRefs.add(q.reference));
      setUsedReferences(newRefs);

      // Save with cap enforcement
      try {
        await storage.set(`entry:${entry.id}`, JSON.stringify(entry));
        setHistory(prev => {
          const updated = [entry, ...prev];
          // Enforce cap: evict oldest (but never evict favorites)
          if (updated.length > MAX_STORED_ENTRIES) {
            const toEvict = updated.slice(MAX_STORED_ENTRIES).filter(e => !favorites.has(e.id));
            toEvict.forEach(e => storage.delete(`entry:${e.id}`).catch(() => {}));
            return updated.filter(e => favorites.has(e.id) || updated.indexOf(e) < MAX_STORED_ENTRIES);
          }
          return updated;
        });
      } catch (e) { console.warn('Save failed:', e); }

      fetchIllustration(entry, parsed.theme);
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
      console.error('Submit failed:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchIllustration = async (entry, theme) => {
    try {
      const apiResponse = await fetchWithRetry(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 2200,
          messages: [{
            role: "user",
            content: `Create a stained-glass-style SVG illustration for: "${theme || 'morning light'}".\n\nOutput ONLY raw SVG. Start <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 500"> end </svg>. Use deep jewel-tone colors: #1a1530 (background lead), #3a5f8a, #5a3a5a, #8a6a2a, #7a2a4a, #3a6a4a, #a87020, #6b9dd9, #d9b35a, #c45a80. Style: medieval stained glass cathedral window — geometric panels with dark lead lines (stroke="#0a0820" stroke-width="2-4"), faceted shapes, radiant light. Symbolic imagery: doves, light rays, hands, paths, water, wheat, trees, mountains, lanterns. NO faces, NO text. Use gradients for inner glow within panels.`
          }]
        })
      });

      if (!apiResponse.ok) return;
      const data = await apiResponse.json();
      let svg = data.content.filter(b => b.type === "text").map(b => b.text).join("\n").trim();
      svg = svg.replace(/^```(?:svg|xml)?\s*/i, '').replace(/```\s*$/, '').trim();
      if (!svg.startsWith('<svg') || !svg.includes('</svg>')) return;

      // Sanitize before storing/displaying
      svg = sanitizeSVG(svg);

      const updated = { ...entry, illustration: svg };
      setResponse(prev => prev && prev.id === entry.id ? updated : prev);
      setHistory(prev => prev.map(e => e.id === entry.id ? updated : e));
      try { await storage.set(`entry:${entry.id}`, JSON.stringify(updated)); } catch (e) { console.warn('Save illustration failed:', e); }
    } catch (err) { console.warn('Illustration fetch failed:', err); }
  };

  const deleteEntry = async (id) => {
    try {
      await storage.delete(`entry:${id}`);
      setHistory(prev => prev.filter(e => e.id !== id));
      // Also remove from favorites if present
      let removedFav = false;
      let nextArr = [];
      setFavorites(prev => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        removedFav = true;
        nextArr = Array.from(next);
        return next;
      });
      if (removedFav) {
        try { await storage.set('favorites', JSON.stringify(nextArr)); } catch (e) {}
      }
    } catch (e) { console.warn('Delete failed:', e); }
  };

  // === FAVORITES ===
  const toggleFavorite = async (id) => {
    let nextArr = [];
    setFavorites(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      nextArr = Array.from(next);
      return next;
    });
    try { await storage.set('favorites', JSON.stringify(nextArr)); }
    catch (e) { console.warn('Save favorites failed:', e); }
  };

  // === SHARE ===
  const shareResponse = async (entry) => {
    const text = entry.quotes
      .map(q => `"${q.text}"\n— ${q.speaker || 'Jesus'}, ${q.reference}`)
      .join('\n\n')
      + `\n\n${entry.response}\n\n— from My Guiding Light`;

    const shareData = {
      title: 'A word from My Guiding Light',
      text,
    };

    try {
      if (navigator.share && navigator.canShare && navigator.canShare(shareData)) {
        await navigator.share(shareData);
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(text);
        showToast('Word copied to clipboard.');
      } else {
        showToast('Sharing is not supported in this browser.');
      }
    } catch (err) {
      if (err.name !== 'AbortError') console.warn('Share failed:', err);
    }
  };

  // === AUDIO READ-ALOUD ===
  // Voice selection: strongly prefer male voices (this pastoral word is in Jesus's voice).
  // We look for known-male voice identifiers across platforms.
  const pickVoice = () => {
    const voices = window.speechSynthesis.getVoices() || [];
    if (!voices.length) return null;

    // Explicit male voice name patterns across iOS, Android, Chrome, Samsung, Windows
    const malePatterns = [
      // iOS / macOS
      /^Daniel/i, /^Aaron/i, /^Fred/i, /^Alex/i, /^Tom/i, /^Arthur/i, /^Rishi/i, /^Reed/i,
      // Google (Chrome / Android)
      /Google UK English Male/i,
      /Google US English.*Male/i,
      /en-.*x-.*male/i,           // low-level identifiers like en-us-x-iom-network
      /en-us-x-(iom|iol|tpf)/i,   // known male Google TTS voice IDs
      // Samsung / Android TTS
      /Samsung.*Male/i,
      /^en-us-x-sfg-.*/i,
      // Windows / Edge
      /Microsoft (David|Mark|Guy|Ryan|Andrew|Brian|Christopher|Eric|Roger)/i,
      // Generic
      /\bmale\b/i,
    ];
    // Names to avoid (known-female voices)
    const femalePatterns = [
      /^Samantha/i, /^Karen/i, /^Moira/i, /^Tessa/i, /^Fiona/i, /^Victoria/i, /^Serena/i,
      /Google UK English Female/i, /Google US English.*Female/i,
      /Microsoft (Zira|Ana|Aria|Jenny|Michelle|Emma)/i,
      /\bfemale\b/i,
    ];

    // English voices only
    const english = voices.filter(v => /^en/i.test(v.lang || ''));

    // First pass: prefer local (non-network) male voices — they're higher quality
    const localMale = english.find(v =>
      v.localService && malePatterns.some(p => p.test(v.name)) && !femalePatterns.some(p => p.test(v.name))
    );
    if (localMale) return localMale;

    // Second: any male match
    const anyMale = english.find(v =>
      malePatterns.some(p => p.test(v.name)) && !femalePatterns.some(p => p.test(v.name))
    );
    if (anyMale) return anyMale;

    // Third: any voice not explicitly female (better than a female-default)
    const nonFemale = english.find(v => !femalePatterns.some(p => p.test(v.name)));
    if (nonFemale) return nonFemale;

    // Last resort: any English voice
    return english[0] || null;
  };

  const readAloud = (entry) => {
    if (!('speechSynthesis' in window)) {
      showToast('Read-aloud is not supported in this browser.');
      return;
    }
    // Stop if already reading
    if (readingAloud) {
      window.speechSynthesis.cancel();
      setReadingAloud(false);
      return;
    }

    // Build the script: each quote with speaker, then Jesus's pastoral word
    const parts = [];
    entry.quotes.forEach(q => {
      const speaker = q.speaker || 'Jesus';
      parts.push(`${speaker} says:`);
      parts.push(q.text);
    });
    parts.push('And Jesus says to you:');
    parts.push(entry.response);

    const speakNow = () => {
      const utterance = new SpeechSynthesisUtterance(parts.join('. '));
      // Warm, deliberate delivery — slower, slightly lower pitch
      utterance.rate = 0.82;
      utterance.pitch = 0.78;
      utterance.volume = 1;

      const preferred = pickVoice();
      if (preferred) utterance.voice = preferred;

      utterance.onend = () => setReadingAloud(false);
      utterance.onerror = () => setReadingAloud(false);

      window.speechSynthesis.speak(utterance);
      setReadingAloud(true);
    };

    // Voices sometimes aren't loaded on first call — wait for them
    const voices = window.speechSynthesis.getVoices();
    if (voices && voices.length > 0) {
      speakNow();
    } else {
      const onVoicesReady = () => {
        window.speechSynthesis.removeEventListener('voiceschanged', onVoicesReady);
        speakNow();
      };
      window.speechSynthesis.addEventListener('voiceschanged', onVoicesReady);
      // Fallback in case the event never fires
      setTimeout(() => {
        window.speechSynthesis.removeEventListener('voiceschanged', onVoicesReady);
        speakNow();
      }, 800);
    }
  };

  // === REFLECTION ===
  const saveReflection = async () => {
    if (!response) return;
    const trimmed = reflection.trim();
    // If empty, remove reflection field entirely
    const updated = trimmed
      ? { ...response, reflection: trimmed }
      : (() => { const { reflection: _, ...rest } = response; return rest; })();
    setResponse(updated);
    setHistory(prev => prev.map(e => e.id === response.id ? updated : e));
    try { await storage.set(`entry:${response.id}`, JSON.stringify(updated)); }
    catch (e) { console.warn('Save reflection failed:', e); }
  };

  const generateCanvas = async (entry) => {
    const width = 1080, height = 1350;
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d');

    // Dark cathedral background (radial gradient)
    const bgGrad = ctx.createRadialGradient(width/2, 0, 0, width/2, height/2, height);
    bgGrad.addColorStop(0, '#2a2050');
    bgGrad.addColorStop(0.4, '#15102a');
    bgGrad.addColorStop(1, '#080612');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    // Soft gold light leak at top
    const lightGrad = ctx.createRadialGradient(width/2, 0, 0, width/2, 0, width * 0.6);
    lightGrad.addColorStop(0, 'rgba(240, 192, 96, 0.18)');
    lightGrad.addColorStop(1, 'rgba(240, 192, 96, 0)');
    ctx.fillStyle = lightGrad;
    ctx.fillRect(0, 0, width, height);

    // Inner luminous parchment panel with heavy lead border
    const panelX = 60, panelY = 60, panelW = width - 120, panelH = height - 120;
    ctx.fillStyle = '#f5ecd9';
    ctx.fillRect(panelX, panelY, panelW, panelH);

    // Soft inner glow on parchment
    const glowGrad = ctx.createRadialGradient(width/2, panelY + 200, 0, width/2, panelY + 200, panelW);
    glowGrad.addColorStop(0, 'rgba(240, 192, 96, 0.08)');
    glowGrad.addColorStop(1, 'rgba(240, 192, 96, 0)');
    ctx.fillStyle = glowGrad;
    ctx.fillRect(panelX, panelY, panelW, panelH);

    // Lead border (thick + thin)
    ctx.strokeStyle = '#0a0820';
    ctx.lineWidth = 8;
    ctx.strokeRect(panelX, panelY, panelW, panelH);
    ctx.strokeStyle = '#f0c060';
    ctx.lineWidth = 1;
    ctx.strokeRect(panelX + 10, panelY + 10, panelW - 20, panelH - 20);

    // Title block
    ctx.fillStyle = '#3d2817';
    ctx.font = '500 52px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText('My Guiding Light', width / 2, panelY + 110);

    // Ornament under title
    ctx.fillStyle = '#8b1a1a';
    ctx.font = '20px Georgia, serif';
    ctx.fillText('✦   ✦   ✦', width / 2, panelY + 150);

    let y = panelY + 210;

    // Illustration (best-effort, failure should not stop the rest)
    if (entry.illustration) {
      try {
        const svgBlob = new Blob([entry.illustration], { type: 'image/svg+xml;charset=utf-8' });
        const svgUrl = URL.createObjectURL(svgBlob);
        const img = await new Promise((resolve, reject) => {
          const i = new Image();
          i.crossOrigin = 'anonymous';
          i.onload = () => resolve(i);
          i.onerror = () => reject(new Error('img-error'));
          i.src = svgUrl;
          setTimeout(() => reject(new Error('img-timeout')), 4000);
        });
        const imgW = panelW - 80;
        const imgH = imgW * (5/8);
        const imgX = (width - imgW) / 2;
        ctx.strokeStyle = '#0a0820';
        ctx.lineWidth = 4;
        ctx.strokeRect(imgX - 2, y - 2, imgW + 4, imgH + 4);
        try {
          ctx.drawImage(img, imgX, y, imgW, imgH);
        } catch (drawErr) {
          // Canvas tainted; skip image but continue rendering text
        }
        URL.revokeObjectURL(svgUrl);
        y += imgH + 40;
      } catch (e) {
        // Image failed — continue without it
        y = panelY + 250;
      }
    }

    const wrapText = (text, maxWidth, font) => {
      ctx.font = font;
      const words = text.split(' ');
      const lines = [];
      let line = '';
      for (const w of words) {
        const test = line ? line + ' ' + w : w;
        if (ctx.measureText(test).width > maxWidth && line) {
          lines.push(line);
          line = w;
        } else {
          line = test;
        }
      }
      if (line) lines.push(line);
      return lines;
    };

    const textMaxW = panelW - 120;

    // Quotes
    entry.quotes.forEach((q) => {
      const isJesus = (q.speaker || 'Jesus').toLowerCase() === 'jesus';
      const qFont = 'italic 500 28px Georgia, serif';
      const lines = wrapText(`"${q.text}"`, textMaxW, qFont);
      ctx.fillStyle = isJesus ? '#8b1a1a' : '#5a4a2a';
      ctx.font = qFont;
      lines.forEach(l => { ctx.fillText(l, width / 2, y); y += 40; });
      y += 4;
      // Speaker + reference line
      ctx.fillStyle = '#8b6f47';
      ctx.font = '500 17px Georgia, serif';
      const speakerText = isJesus ? '✦ JESUS' : (q.speaker || '').toUpperCase();
      const refText = q.reference.toUpperCase();
      ctx.fillText(`${speakerText}   ·   ${refText}`, width / 2, y);
      y += 38;
    });

    // Divider
    ctx.fillStyle = '#8b1a1a';
    ctx.font = '22px Georgia, serif';
    ctx.fillText('✦', width / 2, y);
    y += 42;

    // "And Jesus says to you" label
    ctx.fillStyle = '#8b6f47';
    ctx.font = 'italic 18px Georgia, serif';
    ctx.fillText('And Jesus says to you —', width / 2, y);
    y += 36;

    // Response prose
    const rFont = 'italic 22px Georgia, serif';
    const rLines = wrapText(entry.response, textMaxW, rFont);
    ctx.fillStyle = '#3d2817';
    ctx.font = rFont;
    rLines.forEach(l => { ctx.fillText(l, width / 2, y); y += 34; });

    // Footer disclaimer
    ctx.fillStyle = '#8b6f47';
    ctx.font = 'italic 14px Georgia, serif';
    ctx.fillText('Verify quotes against scripture', width / 2, panelY + panelH - 50);

    return canvas;
  };

  const openImagePreview = async (entry) => {
    try {
      const canvas = await generateCanvas(entry);
      // Use a data URL instead of a blob URL — blob URLs from sandboxed iframes
      // are blocked from cross-context navigation/download. Data URLs are self-contained
      // and work for both <img src> and right-click-save.
      const dataUrl = canvas.toDataURL('image/png');
      // Also produce a blob for clipboard support (clipboard works in same context)
      const blob = await new Promise((resolve) => {
        canvas.toBlob((b) => resolve(b), 'image/png');
      });
      setImagePreview({ url: dataUrl, blob, entry });
    } catch (err) {
      console.error('Image generation failed:', err);
      setImagePreview({
        url: null,
        blob: null,
        entry,
        error: 'Could not generate image. The illustration may be blocking it. Try again or remove the illustration.'
      });
    }
  };

  const closeImagePreview = () => {
    setImagePreview(null);
  };

  const downloadImage = () => {
    if (!imagePreview || !imagePreview.url) return;
    const a = document.createElement('a');
    a.href = imagePreview.url;
    a.download = `my-guiding-light-${imagePreview.entry.id}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const isIOS = typeof navigator !== 'undefined' &&
    /iPad|iPhone|iPod/.test(navigator.userAgent) &&
    !window.MSStream;

  const formatDate = (ts) => new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <div style={S.app}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&family=EB+Garamond:ital,wght@0,400;0,500;1,400&family=UnifrakturMaguntia&display=swap');
        * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
        body { margin: 0; background: #08061a; }

        @keyframes flickerIn {
          0% { opacity: 0; filter: brightness(0.3); }
          40% { opacity: 0.6; filter: brightness(1.2); }
          60% { opacity: 0.4; filter: brightness(0.9); }
          100% { opacity: 1; filter: brightness(1); }
        }
        .panel { animation: flickerIn 0.6s ease-out both; }

        @keyframes pulse {
          0%, 100% { opacity: 0.4; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.1); }
        }
        .pulse-dot span { animation: pulse 1.4s ease-in-out infinite; }
        .pulse-dot span:nth-child(2) { animation-delay: 0.2s; }
        .pulse-dot span:nth-child(3) { animation-delay: 0.4s; }

        .sub-glass {
          transition: all 0.25s ease;
          cursor: pointer;
        }
        .sub-glass:active { transform: scale(0.95); }

        .nav-tab { transition: all 0.2s; }
        .nav-tab:hover { color: #f0c060 !important; }

        .primary-cta {
          transition: all 0.3s;
          cursor: pointer;
        }
        .primary-cta:hover:not(:disabled) {
          box-shadow: 0 0 40px rgba(240, 192, 96, 0.5);
          transform: translateY(-1px);
        }
        .primary-cta:disabled { opacity: 0.3; cursor: not-allowed; }

        .ghost-cta { transition: color 0.2s, border-color 0.2s; cursor: pointer; }
        .ghost-cta:hover { color: #f0c060; border-color: #f0c060; }

        .toolbar-btn { transition: all 0.2s; }
        .toolbar-btn:hover {
          color: #8b1a1a;
          border-color: #8b1a1a;
          background: rgba(139, 26, 26, 0.05);
        }

        input[type="search"]:focus { outline: none; border-color: #f0c060 !important; }

        textarea:focus { outline: none; border-color: #f0c060 !important; }
        textarea::placeholder { color: rgba(245, 236, 217, 0.35); font-style: italic; }

        .light-rays::before {
          content: '';
          position: absolute;
          inset: -50% -20% auto -20%;
          height: 80%;
          background: radial-gradient(ellipse at center top, rgba(240, 192, 96, 0.15) 0%, transparent 60%);
          pointer-events: none;
          z-index: 0;
          animation: godraysDrift 24s ease-in-out infinite;
        }

        @keyframes godraysDrift {
          0%, 100% { transform: translateX(0) scale(1); opacity: 1; }
          50% { transform: translateX(4%) scale(1.05); opacity: 0.85; }
        }

        /* Distant candle flicker in corner */
        .candle-flicker {
          position: fixed;
          bottom: 24px; left: 20px;
          width: 6px; height: 6px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(240,192,96,0.9) 0%, rgba(240,150,60,0.4) 45%, transparent 70%);
          box-shadow: 0 0 24px 6px rgba(240, 192, 96, 0.35);
          animation: candleFlicker 3.2s ease-in-out infinite;
          pointer-events: none;
          z-index: 1;
        }
        @keyframes candleFlicker {
          0%, 100% { opacity: 0.85; transform: scale(1); }
          25% { opacity: 1; transform: scale(1.15); }
          50% { opacity: 0.7; transform: scale(0.95); }
          75% { opacity: 0.95; transform: scale(1.08); }
        }

        /* Cinematic response reveal */
        @keyframes responseMaterialize {
          0% { opacity: 0; transform: scale(0.985); }
          100% { opacity: 1; transform: scale(1); }
        }
        .response-materialize { animation: responseMaterialize 2.4s cubic-bezier(0.16, 1, 0.3, 1) both; }

        /* Illustration blooms with light pouring outward from center */
        @keyframes illustrationBloom {
          0% { opacity: 0; filter: brightness(0.4) blur(6px); transform: scale(0.98); }
          50% { opacity: 1; filter: brightness(1.1) blur(0); }
          100% { opacity: 1; filter: brightness(1) blur(0); transform: scale(1); }
        }
        .illustration-bloom { animation: illustrationBloom 3.4s ease-out both; }

        /* Pastoral spotlight — soft radial glow behind Jesus's word */
        @keyframes pastoralGlow {
          0% { box-shadow: inset 0 0 0 rgba(240, 192, 96, 0); }
          100% { box-shadow: inset 0 0 60px rgba(240, 192, 96, 0.08); }
        }

        /* Closing "Go in peace" overlay */
        @keyframes closingFade {
          0% { opacity: 0; }
          15% { opacity: 1; }
          75% { opacity: 1; }
          100% { opacity: 0; }
        }
        .closing-moment {
          position: fixed; inset: 0;
          background: rgba(8, 6, 26, 0.94);
          z-index: 200;
          display: flex; flex-direction: column;
          align-items: center; justify-content: center;
          gap: 24px;
          animation: closingFade 2.4s ease both;
          backdrop-filter: blur(6px);
        }

        .drop-cap-illuminated::first-letter {
          font-family: 'UnifrakturMaguntia', serif;
          font-size: 88px; float: left; line-height: 0.78;
          padding: 8px 14px 0 0; color: #8b1a1a;
        }

        /* Phase 2: Opening ceremony */
        .opening-ceremony {
          position: fixed; inset: 0;
          background: radial-gradient(ellipse at center, #0a0820 0%, #050310 100%);
          z-index: 300;
          display: flex; align-items: center; justify-content: center;
          transition: opacity 2s ease;
          overflow: hidden;
        }

        @keyframes toastIn {
          from { opacity: 0; transform: translateX(-50%) translateY(20px); }
          to { opacity: 1; transform: translateX(-50%) translateY(0); }
        }

        /* Phase 2: Stained-glass panel refraction on hover */
        .stained-glass-panel {
          transition: transform 0.6s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.8s ease;
        }
        .stained-glass-panel:active {
          transform: scale(0.97);
        }
        @media (hover: hover) {
          .stained-glass-panel:hover {
            transform: translateY(-1px);
          }
        }
      `}</style>

      {/* TOP BAR */}
      <header style={S.topBar}>
        <div style={S.topBarInner}>
          <div style={S.brandMark}>
            <span style={S.brandSymbol}>✦</span>
          </div>
          <h1 style={S.brandTitle}>My Guiding Light</h1>
          <button onClick={() => setView(view === 'history' ? 'main' : 'history')} style={S.topAction}>
            {view === 'history' ? '✕' : '☰'}
          </button>
        </div>
      </header>

      {/* Ambient distant candle flicker */}
      <div className="candle-flicker" aria-hidden="true"></div>

      {/* PHASE 2: Opening ceremony */}
      {openingCeremony && (
        <div className="opening-ceremony" style={{
          opacity: ceremonyStage >= 4 ? 0 : 1,
        }}>
          {/* The candle at center */}
          <div style={{
            ...S.ceremonyCandle,
            opacity: ceremonyStage >= 1 ? 1 : 0,
            transform: ceremonyStage >= 1 ? 'scale(1)' : 'scale(0.6)',
            transition: 'opacity 2.4s ease, transform 2.4s ease',
          }}>
            <svg viewBox="0 0 100 140" width="80" height="112" xmlns="http://www.w3.org/2000/svg">
              {/* Candle body */}
              <rect x="42" y="60" width="16" height="70" fill="#3a2a1a" stroke="#f0c060" strokeWidth="1"/>
              <ellipse cx="50" cy="60" rx="8" ry="2" fill="#f0c060" fillOpacity="0.4" stroke="#f0c060" strokeWidth="0.8"/>
              {/* Wick */}
              <line x1="50" y1="60" x2="50" y2="52" stroke="#0a0820" strokeWidth="1"/>
              {/* Flame */}
              {ceremonyStage >= 1 && (
                <>
                  <ellipse cx="50" cy="42" rx="6" ry="12" fill="#f0c060" fillOpacity="0.7" className="ceremony-flame">
                    <animate attributeName="ry" values="12;10;13;11;12" dur="1.8s" repeatCount="indefinite"/>
                  </ellipse>
                  <ellipse cx="50" cy="44" rx="3" ry="7" fill="#ffe0a0" fillOpacity="0.9">
                    <animate attributeName="ry" values="7;6;8;7" dur="1.2s" repeatCount="indefinite"/>
                  </ellipse>
                </>
              )}
              {/* Glow around flame */}
              {ceremonyStage >= 1 && (
                <circle cx="50" cy="42" r="24" fill="#f0c060" fillOpacity="0.12">
                  <animate attributeName="r" values="24;28;22;26" dur="3s" repeatCount="indefinite"/>
                </circle>
              )}
            </svg>
          </div>

          {/* Stained glass builds itself around the edges (only during 'first' full ceremony) */}
          {openingCeremony === 'first' && (
            <>
              <div style={{
                ...S.ceremonyGlassLeft,
                opacity: ceremonyStage >= 2 ? 1 : 0,
                transform: ceremonyStage >= 2 ? 'translateX(0)' : 'translateX(-40px)',
                transition: 'opacity 3.5s ease, transform 3.5s ease',
              }}>
                <svg viewBox="0 0 200 600" preserveAspectRatio="none" width="100%" height="100%">
                  <defs>
                    <linearGradient id="ceremonyLeft" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0" stopColor="#3a5f8a" stopOpacity="0.8"/>
                      <stop offset="0.5" stopColor="#5a3a5a" stopOpacity="0.6"/>
                      <stop offset="1" stopColor="#8a6a2a" stopOpacity="0.4"/>
                    </linearGradient>
                  </defs>
                  <path d="M 0 0 L 200 120 L 200 480 L 0 600 Z" fill="url(#ceremonyLeft)"/>
                  <path d="M 0 0 L 200 120 M 0 200 L 200 320 M 0 400 L 200 480 M 0 600 L 200 480" stroke="#0a0820" strokeWidth="2" opacity="0.6"/>
                </svg>
              </div>
              <div style={{
                ...S.ceremonyGlassRight,
                opacity: ceremonyStage >= 2 ? 1 : 0,
                transform: ceremonyStage >= 2 ? 'translateX(0)' : 'translateX(40px)',
                transition: 'opacity 3.5s ease, transform 3.5s ease',
              }}>
                <svg viewBox="0 0 200 600" preserveAspectRatio="none" width="100%" height="100%">
                  <defs>
                    <linearGradient id="ceremonyRight" x1="1" y1="0" x2="0" y2="0">
                      <stop offset="0" stopColor="#7a2a4a" stopOpacity="0.8"/>
                      <stop offset="0.5" stopColor="#3a6a4a" stopOpacity="0.6"/>
                      <stop offset="1" stopColor="#a87020" stopOpacity="0.4"/>
                    </linearGradient>
                  </defs>
                  <path d="M 200 0 L 0 120 L 0 480 L 200 600 Z" fill="url(#ceremonyRight)"/>
                  <path d="M 200 0 L 0 120 M 200 200 L 0 320 M 200 400 L 0 480 M 200 600 L 0 480" stroke="#0a0820" strokeWidth="2" opacity="0.6"/>
                </svg>
              </div>
            </>
          )}

          {/* Scripture reveal */}
          {openingCeremony === 'first' && (
            <div style={{
              ...S.ceremonyScripture,
              opacity: ceremonyStage >= 3 ? 1 : 0,
              transform: ceremonyStage >= 3 ? 'translateY(0)' : 'translateY(20px)',
              transition: 'opacity 2s ease, transform 2s ease',
            }}>
              <p style={S.ceremonyScriptureText}>
                <em>&ldquo;Behold, I stand at the door and knock.&rdquo;</em>
              </p>
              <p style={S.ceremonyScriptureRef}>Revelation 3:20</p>
            </div>
          )}
        </div>
      )}

      {/* "Go in peace" closing moment */}
      {closingMoment && (
        <div className="closing-moment">
          <span style={{fontSize: '48px', color: '#f0c060', filter: 'drop-shadow(0 0 24px rgba(240,192,96,0.6))'}}>✦</span>
          <p style={{
            fontFamily: "'Cormorant Garamond', serif",
            fontStyle: 'italic',
            fontSize: '28px',
            color: 'rgba(245,236,217,0.92)',
            letterSpacing: '0.06em',
            margin: 0,
          }}>Go in peace.</p>
        </div>
      )}

      {view === 'main' ? (
        <>
          {step === 'home' && (
            <main style={S.main} className="light-rays">
              {/* Hero: rotating scripture */}
              <section style={S.hero}>
                <div style={S.heroOrnamentTop}>✦</div>
                <p style={S.heroScripture}>
                  <em>&ldquo;{HERO_SCRIPTURES[heroIndex].text}&rdquo;</em>
                </p>
                <p style={S.heroReference}>{HERO_SCRIPTURES[heroIndex].ref}</p>
              </section>

              {/* Stained glass panel grid */}
              <section style={S.glassSection}>
                <div style={S.sectionLabel}>
                  <span style={S.sectionLine}></span>
                  <span style={S.sectionLabelText}>Choose what stirs</span>
                  <span style={S.sectionLine}></span>
                </div>

                <div style={S.glassGrid}>
                  {(() => {
                    const items = [];
                    const cols = 3;
                    // Fixed rotations that read as intentional stained glass, not random skew
                    const cleanRotations = [0, 90, 180, 270];
                    for (let i = 0; i < MOODS.length; i++) {
                      const mood = MOODS[i];
                      const count = countMoodSelections(mood.id);
                      const isActive = activePanels.has(mood.id);
                      const leadRotation = cleanRotations[i % cleanRotations.length];
                      items.push(
                        <button
                          key={`panel-${mood.id}`}
                          className="panel stained-glass-panel"
                          onClick={() => togglePanel(mood.id)}
                          style={{
                            ...S.glassPanel,
                            background: mood.jewel,
                            boxShadow: count > 0
                              ? `0 0 28px ${mood.glow}80, inset 0 0 30px ${mood.glow}30`
                              : `inset 0 0 20px rgba(0,0,0,0.5)`,
                            animationDelay: `${i * 0.04}s`,
                            border: isActive ? `2px solid ${mood.glow}` : `2px solid #0a0820`,
                          }}
                        >
                          {/* Stained glass color fields */}
                          <div style={{
                            ...S.glassColorFields,
                            background: `
                              radial-gradient(ellipse at 25% 30%, ${mood.glow}55 0%, transparent 55%),
                              radial-gradient(ellipse at 75% 70%, ${mood.jewel}dd 0%, ${mood.jewel}88 60%),
                              linear-gradient(135deg, ${mood.jewel} 0%, ${mood.glow}22 50%, ${mood.jewel} 100%)
                            `,
                          }}/>
                          {/* Lead line overlay — a clean Y-split that divides the panel into 3 fields */}
                          <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{
                            ...S.leadLines,
                            transform: `rotate(${leadRotation}deg)`,
                          }} aria-hidden="true">
                            {/* Three lines meeting at center: top, bottom-left, bottom-right */}
                            <path d="M 50 0 L 50 50" stroke="#0a0820" strokeWidth="1.5" fill="none" opacity="0.55" strokeLinecap="round"/>
                            <path d="M 50 50 L 8 100" stroke="#0a0820" strokeWidth="1.5" fill="none" opacity="0.55" strokeLinecap="round"/>
                            <path d="M 50 50 L 92 100" stroke="#0a0820" strokeWidth="1.5" fill="none" opacity="0.55" strokeLinecap="round"/>
                            {/* Small center pane accent — softens the Y intersection */}
                            <circle cx="50" cy="50" r="2.5" fill="#0a0820" opacity="0.5"/>
                          </svg>
                          {/* Inner glow that intensifies when selected */}
                          <div style={{
                            ...S.glassInnerGlow,
                            opacity: count > 0 ? 1 : 0,
                            background: `radial-gradient(circle at 50% 50%, ${mood.glow}30 0%, transparent 65%)`,
                          }}/>
                          {/* Content */}
                          <div style={S.glassContent}>
                            <span style={S.glassIcon}>{GLYPHS[mood.id] || mood.icon}</span>
                            <span style={S.glassLabel}>{mood.label}</span>
                          </div>
                          {count > 0 && (
                            <span style={{...S.glassCount, background: mood.glow, color: '#08061a'}}>
                              {count}
                            </span>
                          )}
                        </button>
                      );

                      // After the last panel in a row, insert any open drawers from this row
                      const isLastInRow = (i + 1) % cols === 0 || i === MOODS.length - 1;
                      if (isLastInRow) {
                        const rowStart = Math.floor(i / cols) * cols;
                        const rowMoods = MOODS.slice(rowStart, rowStart + cols);
                        const openInRow = rowMoods.filter(m => activePanels.has(m.id));
                        openInRow.forEach(mood => {
                          items.push(
                            <div key={`drawer-${mood.id}`} style={S.subDrawer} className="panel">
                              <div style={{...S.subDrawerHeader, color: mood.glow}}>
                                <span style={{width: '24px', height: '24px', display: 'inline-flex'}}>{GLYPHS[mood.id] || mood.icon}</span>
                                <span style={S.subDrawerLabel}>{mood.label}</span>
                                <button onClick={() => togglePanel(mood.id)} style={S.subClose} aria-label="Close">✕</button>
                              </div>
                              <div style={S.subGrid}>
                                <button
                                  className="sub-glass"
                                  onClick={() => toggleSelection(mood.id)}
                                  style={{
                                    ...S.subGlassBtn,
                                    background: selections.has(mood.id) ? mood.jewel : 'transparent',
                                    borderColor: selections.has(mood.id) ? mood.glow : 'rgba(245, 236, 217, 0.2)',
                                    color: selections.has(mood.id) ? '#f5ecd9' : 'rgba(245, 236, 217, 0.7)',
                                    boxShadow: selections.has(mood.id) ? `0 0 16px ${mood.glow}80` : 'none',
                                    fontStyle: 'italic',
                                  }}
                                >
                                  in general
                                </button>
                                {mood.subs.map(sub => {
                                  const key = `${mood.id}:${sub}`;
                                  const sel = selections.has(key);
                                  return (
                                    <button
                                      key={key}
                                      className="sub-glass"
                                      onClick={() => toggleSelection(key)}
                                      style={{
                                        ...S.subGlassBtn,
                                        background: sel ? mood.jewel : 'transparent',
                                        borderColor: sel ? mood.glow : 'rgba(245, 236, 217, 0.2)',
                                        color: sel ? '#f5ecd9' : 'rgba(245, 236, 217, 0.7)',
                                        boxShadow: sel ? `0 0 16px ${mood.glow}80` : 'none',
                                      }}
                                    >
                                      {sub}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        });
                      }
                    }
                    return items;
                  })()}
                </div>
              </section>

              {/* Text input */}
              <section style={S.inputSection}>
                <div style={S.sectionLabel}>
                  <span style={S.sectionLine}></span>
                  <span style={S.sectionLabelText}>Or speak freely</span>
                  <span style={S.sectionLine}></span>
                </div>
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="A worry, a question, a moment of joy or doubt..."
                  style={S.textarea}
                  rows={4}
                />
              </section>

              {error && <div style={S.error}>{typeof error === 'string' ? error : (error.message || 'Something went wrong')}</div>}

              {/* Spacer for sticky bottom */}
              <div style={{ height: '120px' }} />
            </main>
          )}

          {step === 'response' && response && (
            <main style={S.responseMain}>
              <article style={S.responseCard} className="response-materialize">
                {response.illustration && (
                  <div style={S.responseImageFrame} className="illustration-bloom">
                    <div dangerouslySetInnerHTML={{ __html: response.illustration }} style={S.illustrationInner} />
                  </div>
                )}

                <div style={S.responseInner}>
                  <div style={{...S.responseOrnamentTop, opacity: revealStage >= 1 ? 1 : 0, transition: 'opacity 1.4s ease'}}>
                    <span style={S.ornLine}></span>
                    <span style={S.ornSymbol}>✦</span>
                    <span style={S.ornLine}></span>
                  </div>

                  <div style={S.responseQuotes}>
                    {response.quotes.map((q, i) => {
                      const isJesus = (q.speaker || 'Jesus').toLowerCase() === 'jesus';
                      const isVisible = revealStage >= (i + 1);
                      return (
                        <blockquote
                          key={q.reference || i}
                          style={{
                            ...S.responseQuote,
                            borderLeftColor: isJesus ? '#8b1a1a' : '#8b6f47',
                            opacity: isVisible ? 1 : 0,
                            transform: isVisible ? 'translateY(0)' : 'translateY(12px)',
                            transition: 'opacity 1.6s ease-out, transform 1.6s ease-out',
                          }}
                        >
                          <p style={{
                            ...S.responseQuoteText,
                            color: isJesus ? '#8b1a1a' : '#5a4a2a',
                          }}>&ldquo;{q.text}&rdquo;</p>
                          <div style={S.responseQuoteMeta}>
                            <span style={S.responseSpeaker}>
                              {isJesus ? '✦ Jesus' : q.speaker}
                            </span>
                            <span style={S.responseRef}>{q.reference}</span>
                            {q.context && <span style={S.responseContext}>{q.context}</span>}
                          </div>
                        </blockquote>
                      );
                    })}
                  </div>

                  <div style={{
                    ...S.responseDivider,
                    opacity: revealStage >= 4 ? 1 : 0,
                    transition: 'opacity 1.4s ease',
                  }}>
                    <span style={S.ornLine}></span>
                    <span style={S.ornSymbol}>✦</span>
                    <span style={S.ornLine}></span>
                  </div>

                  <div style={{
                    opacity: revealStage >= 4 ? 1 : 0,
                    transform: revealStage >= 4 ? 'translateY(0)' : 'translateY(12px)',
                    transition: 'opacity 1.8s ease-out, transform 1.8s ease-out',
                  }}>
                    <p style={S.jesusVoiceLabel}>And Jesus says to you —</p>

                    <div style={S.pastoralSpotlight}>
                      <p style={S.responseProse} className="drop-cap-illuminated">{response.response}</p>
                    </div>
                  </div>

                  <div style={{
                    ...S.responseToolbar,
                    opacity: revealStage >= 4 ? 1 : 0,
                    transition: 'opacity 1.4s ease 0.6s',
                  }}>
                    <button
                      onClick={() => toggleFavorite(response.id)}
                      style={S.toolbarBtn}
                      className="toolbar-btn"
                      aria-label={favorites.has(response.id) ? 'Unfavorite' : 'Favorite'}
                    >
                      <span style={{ color: favorites.has(response.id) ? '#8b1a1a' : '#8b6f47', fontSize: '18px' }}>
                        {favorites.has(response.id) ? '♥' : '♡'}
                      </span>
                      <span>{favorites.has(response.id) ? 'Favorited' : 'Favorite'}</span>
                    </button>
                    <button
                      onClick={() => readAloud(response)}
                      style={S.toolbarBtn}
                      className="toolbar-btn"
                      aria-label="Read aloud"
                    >
                      <span style={{ fontSize: '16px' }}>{readingAloud ? '◼' : '▶'}</span>
                      <span>{readingAloud ? 'Stop' : 'Read Aloud'}</span>
                    </button>
                    <button
                      onClick={() => shareResponse(response)}
                      style={S.toolbarBtn}
                      className="toolbar-btn"
                      aria-label="Share"
                    >
                      <span style={{ fontSize: '14px' }}>↗</span>
                      <span>Share</span>
                    </button>
                  </div>
                </div>
              </article>

              {/* Reflection */}
              <section style={S.reflectionSection}>
                <p style={S.reflectionLabel}>What stays with you?</p>
                <textarea
                  value={reflection}
                  onChange={(e) => setReflection(e.target.value)}
                  onBlur={saveReflection}
                  placeholder="A thought to carry forward... (saves automatically)"
                  style={S.reflectionInput}
                  rows={3}
                />
              </section>

              <p style={S.disclaimer}>
                Scripture quotations are AI-generated. Verify against your preferred Bible translation.
              </p>

              <div style={{ height: '120px' }} />
            </main>
          )}
        </>
      ) : (
        // HISTORY
        <main style={S.historyMain}>
          <section style={S.hero}>
            <p style={S.heroEyebrow}>What you have kept</p>
            <h2 style={S.heroHeadline}>Saved Words</h2>
          </section>

          {history.length === 0 ? (
            <div style={S.emptyState}>
              <span style={S.emptyOrn}>✦</span>
              <p style={S.emptyText}>Words you receive will gather here.</p>
              <button onClick={() => setView('main')} className="primary-cta" style={S.primaryBtn}>
                Bring something
              </button>
            </div>
          ) : (() => {
            // Filter + search
            const lower = historySearch.trim().toLowerCase();
            const filtered = history.filter(e => {
              if (historyFilter === 'favorites' && !favorites.has(e.id)) return false;
              if (!lower) return true;
              const haystack = [
                e.input || '',
                e.mood || '',
                e.response || '',
                e.reflection || '',
                ...(e.quotes || []).flatMap(q => [q.text, q.reference, q.speaker || '']),
              ].join(' ').toLowerCase();
              return haystack.includes(lower);
            });

            return (
              <>
                <div style={S.historyControls}>
                  <div style={S.historyTabs}>
                    <button
                      onClick={() => setHistoryFilter('all')}
                      style={{
                        ...S.historyTab,
                        color: historyFilter === 'all' ? '#f0c060' : 'rgba(245,236,217,0.5)',
                        borderBottomColor: historyFilter === 'all' ? '#f0c060' : 'transparent',
                      }}
                    >
                      All ({history.length})
                    </button>
                    <button
                      onClick={() => setHistoryFilter('favorites')}
                      style={{
                        ...S.historyTab,
                        color: historyFilter === 'favorites' ? '#f0c060' : 'rgba(245,236,217,0.5)',
                        borderBottomColor: historyFilter === 'favorites' ? '#f0c060' : 'transparent',
                      }}
                    >
                      ♥ Favorites ({favorites.size})
                    </button>
                  </div>
                  <input
                    type="search"
                    value={historySearch}
                    onChange={(e) => setHistorySearch(e.target.value)}
                    placeholder="Search words, references, feelings..."
                    style={S.historySearchInput}
                  />
                </div>

                {filtered.length === 0 ? (
                  <p style={S.noResults}>
                    {historyFilter === 'favorites'
                      ? 'You have not favorited any words yet.'
                      : 'Nothing matches your search.'}
                  </p>
                ) : (
                  <div style={S.historyList}>
                    {filtered.map(entry => (
                      <article key={entry.id} style={S.historyCard}>
                        <div style={S.historyHeaderRow}>
                          <div style={S.historyMeta}>
                            <span style={S.historyDate}>{formatDate(entry.timestamp)}</span>
                            {entry.mood && <span style={S.historyMood}>{entry.mood}</span>}
                          </div>
                          <button
                            onClick={() => toggleFavorite(entry.id)}
                            style={S.historyFavBtn}
                            aria-label="Favorite"
                          >
                            <span style={{ color: favorites.has(entry.id) ? '#f0c060' : 'rgba(245,236,217,0.4)', fontSize: '22px' }}>
                              {favorites.has(entry.id) ? '♥' : '♡'}
                            </span>
                          </button>
                        </div>
                        {entry.input && <p style={S.historyInput}>"{entry.input}"</p>}
                        {entry.illustration && (
                          <div style={S.historyImageFrame}>
                            <div dangerouslySetInnerHTML={{ __html: entry.illustration }} style={S.illustrationInner} />
                          </div>
                        )}
                        {entry.quotes.map((q, i) => {
                          const isJesus = (q.speaker || 'Jesus').toLowerCase() === 'jesus';
                          return (
                            <blockquote
                              key={q.reference || i}
                              style={{
                                ...S.historyQuote,
                                borderLeftColor: isJesus ? '#f0c060' : 'rgba(240, 192, 96, 0.5)',
                              }}
                            >
                              <p style={{
                                ...S.historyQuoteText,
                                color: isJesus ? '#f0c060' : 'rgba(245, 236, 217, 0.85)',
                              }}>"{q.text}"</p>
                              <span style={S.historyRef}>
                                {isJesus ? '✦ Jesus' : q.speaker} · {q.reference}
                              </span>
                            </blockquote>
                          );
                        })}
                        <p style={S.historyResponse}>{entry.response}</p>
                        {entry.reflection && (
                          <div style={S.historyReflection}>
                            <p style={S.historyReflectionLabel}>YOUR REFLECTION</p>
                            <p style={S.historyReflectionText}>{entry.reflection}</p>
                          </div>
                        )}
                        <div style={S.historyActions}>
                          <button onClick={() => shareResponse(entry)} style={S.historyAction} className="ghost-cta">↗ Share</button>
                          <button onClick={() => openImagePreview(entry)} style={S.historyAction} className="ghost-cta">↓ Save</button>
                          <button onClick={() => deleteEntry(entry.id)} style={S.historyAction} className="ghost-cta">× Remove</button>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </>
            );
          })()}
          <div style={{ height: '120px' }} />
        </main>
      )}

      {/* STICKY BOTTOM BAR */}
      {view === 'main' && (
        <div style={S.bottomBar}>
          <div style={S.bottomBarInner}>
            {step === 'home' ? (
              <>
                {selections.size > 0 && (
                  <span style={S.bottomCount}>{selections.size} chosen</span>
                )}
                <button
                  onClick={handleSubmit}
                  disabled={loading || (!input.trim() && selections.size === 0)}
                  className="primary-cta"
                  style={S.primaryBtn}
                >
                  {loading ? (
                    <span className="pulse-dot">
                      Listening <span>.</span><span>.</span><span>.</span>
                    </span>
                  ) : 'Receive a Word'}
                </button>
              </>
            ) : (
              <>
                <button onClick={() => openImagePreview(response)} className="primary-cta" style={S.primaryBtn}>
                  Keep This Word
                </button>
                <button onClick={restart} className="ghost-cta" style={S.ghostBtn}>
                  Begin Again
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Daily prompt modal */}
      {showDailyPrompt && view === 'main' && step === 'home' && !openingCeremony && (
        <div style={S.modalOverlay} onClick={dismissDailyPrompt}>
          <div style={S.dailyPromptContent} onClick={(e) => e.stopPropagation()}>
            <span style={S.dailyPromptOrnament}>✦</span>
            <h3 style={S.dailyPromptTitle}>Today</h3>
            <p style={S.dailyPromptBody}>
              What is on your heart this day?<br/>
              Bring it. He is listening.
            </p>
            <button onClick={dismissDailyPrompt} className="primary-cta" style={S.primaryBtn}>
              I'm ready
            </button>
            <button onClick={dismissDailyPrompt} style={S.dailyPromptDismiss}>
              Not today
            </button>
          </div>
        </div>
      )}

      {/* Image preview modal (Save Image) */}
      {imagePreview && (
        <div style={S.modalOverlay} onClick={closeImagePreview}>
          <div style={S.modalContent} onClick={(e) => e.stopPropagation()}>
            <button onClick={closeImagePreview} style={S.modalClose}>×</button>
            {imagePreview.error ? (
              <div style={{ padding: '24px 0', textAlign: 'center' }}>
                <span style={{ fontSize: '32px', color: '#f0c060', display: 'block', marginBottom: '16px' }}>⚠</span>
                <p style={{ color: 'rgba(245, 236, 217, 0.85)', fontSize: '15px', lineHeight: 1.6, margin: 0 }}>
                  {imagePreview.error}
                </p>
              </div>
            ) : (
              <>
                <img
                  src={imagePreview.url}
                  alt="Your saved word"
                  style={S.modalImage}
                  draggable="true"
                />
                {isIOS ? (
                  <div style={S.saveInstructions}>
                    <p style={S.saveInstructionsTitle}>To save on iPhone:</p>
                    <p style={S.saveInstructionsBody}>
                      Press and hold the image above, then tap <strong style={{color: '#f0c060'}}>"Save to Photos"</strong> (or "Add to Photos").
                    </p>
                  </div>
                ) : (
                  <p style={S.modalHint}>
                    Tap Save below to download. On mobile you can also press and hold the image.
                  </p>
                )}
                <div style={S.modalActions}>
                  {!isIOS && (
                    <button onClick={downloadImage} className="primary-cta" style={S.primaryBtn}>
                      ↓ Save Image
                    </button>
                  )}
                  <button onClick={closeImagePreview} className="ghost-cta" style={S.ghostBtn}>
                    Done
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* In-app toast */}
      {toast && (
        <div style={S.toast}>
          {toast}
        </div>
      )}
    </div>
  );
}

const S = {
  app: {
    minHeight: '100vh',
    background: `
      radial-gradient(ellipse at 50% 0%, #2a2050 0%, #15102a 40%, #080612 100%)
    `,
    color: '#f5ecd9',
    fontFamily: "'EB Garamond', Georgia, serif",
    position: 'relative',
    overflowX: 'hidden',
  },

  // Top bar
  topBar: {
    position: 'sticky', top: 0, zIndex: 20,
    background: 'rgba(8, 6, 26, 0.85)',
    backdropFilter: 'blur(20px)',
    borderBottom: '1px solid rgba(240, 192, 96, 0.12)',
    paddingTop: 'env(safe-area-inset-top, 0)',
  },
  topBarInner: {
    maxWidth: '480px', margin: '0 auto',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '16px 20px',
  },
  brandMark: {
    width: '36px', height: '36px',
    background: 'radial-gradient(circle, rgba(240,192,96,0.3) 0%, transparent 70%)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  brandSymbol: { color: '#f0c060', fontSize: '18px' },
  brandTitle: {
    margin: 0,
    fontFamily: "'Cormorant Garamond', serif",
    fontSize: '20px', fontWeight: 500,
    letterSpacing: '0.15em', textTransform: 'uppercase',
    color: '#f5ecd9',
  },
  topAction: {
    width: '36px', height: '36px',
    background: 'none', border: '1px solid rgba(240, 192, 96, 0.25)',
    color: '#f0c060', fontSize: '16px',
    cursor: 'pointer', borderRadius: '2px',
  },

  // Main layout
  main: {
    maxWidth: '480px', margin: '0 auto',
    padding: '32px 16px 20px',
    position: 'relative',
  },

  // Hero
  hero: { textAlign: 'center', marginBottom: '32px' },
  heroEyebrow: {
    fontFamily: "'Cormorant Garamond', serif",
    fontStyle: 'italic',
    fontSize: '13px',
    letterSpacing: '0.3em',
    textTransform: 'uppercase',
    color: '#f0c060',
    margin: '0 0 16px',
  },
  heroHeadline: {
    fontFamily: "'Cormorant Garamond', serif",
    fontWeight: 500,
    fontSize: '32px',
    lineHeight: 1.2,
    margin: 0,
    color: '#f5ecd9',
    letterSpacing: '-0.005em',
  },

  // Phase 1 Ambitious: Scripture hero
  heroOrnamentTop: {
    fontFamily: "'Cormorant Garamond', serif",
    fontSize: '22px',
    color: '#f0c060',
    marginBottom: '18px',
    filter: 'drop-shadow(0 0 8px rgba(240, 192, 96, 0.4))',
    letterSpacing: '0.4em',
  },
  heroScripture: {
    fontFamily: "'EB Garamond', Georgia, serif",
    fontSize: '22px',
    lineHeight: 1.5,
    color: 'rgba(245, 236, 217, 0.92)',
    margin: '0 auto 12px',
    maxWidth: '380px',
    letterSpacing: '0.005em',
  },
  heroReference: {
    fontFamily: "'Cormorant Garamond', serif",
    fontSize: '12px',
    letterSpacing: '0.35em',
    textTransform: 'uppercase',
    color: 'rgba(240, 192, 96, 0.75)',
    margin: 0,
  },

  // Phase 1 Ambitious: pastoral spotlight — soft radial highlight around Jesus's word
  pastoralSpotlight: {
    position: 'relative',
    padding: '28px 20px 24px',
    background: 'radial-gradient(ellipse at 50% 40%, rgba(240, 192, 96, 0.10) 0%, rgba(240, 192, 96, 0.03) 50%, transparent 80%)',
    borderRadius: '2px',
    marginTop: '4px',
  },

  // Phase 2: Opening ceremony styles
  ceremonyCandle: {
    position: 'relative', zIndex: 2,
    filter: 'drop-shadow(0 0 40px rgba(240, 192, 96, 0.4))',
  },
  ceremonyGlassLeft: {
    position: 'absolute', left: 0, top: 0, bottom: 0,
    width: '30%', maxWidth: '260px',
    zIndex: 1,
  },
  ceremonyGlassRight: {
    position: 'absolute', right: 0, top: 0, bottom: 0,
    width: '30%', maxWidth: '260px',
    zIndex: 1,
  },
  ceremonyScripture: {
    position: 'absolute', bottom: '18%', left: 0, right: 0,
    textAlign: 'center', zIndex: 2,
    padding: '0 32px',
  },
  ceremonyScriptureText: {
    fontFamily: "'EB Garamond', Georgia, serif",
    fontSize: '22px',
    color: 'rgba(245, 236, 217, 0.95)',
    margin: '0 0 12px',
    lineHeight: 1.4,
  },
  ceremonyScriptureRef: {
    fontFamily: "'Cormorant Garamond', serif",
    fontSize: '11px',
    letterSpacing: '0.35em',
    textTransform: 'uppercase',
    color: 'rgba(240, 192, 96, 0.75)',
    margin: 0,
  },

  // Section label
  sectionLabel: {
    display: 'flex', alignItems: 'center', gap: '16px',
    marginBottom: '24px',
  },
  sectionLine: {
    flex: 1, height: '1px',
    background: 'linear-gradient(to right, transparent, rgba(240, 192, 96, 0.3), transparent)',
  },
  sectionLabelText: {
    fontFamily: "'Cormorant Garamond', serif",
    fontSize: '12px',
    letterSpacing: '0.3em',
    textTransform: 'uppercase',
    color: 'rgba(240, 192, 96, 0.7)',
    whiteSpace: 'nowrap',
  },

  // Glass panel grid
  glassSection: { marginBottom: '40px' },
  glassGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '8px',
  },
  glassPanel: {
    aspectRatio: '1',
    border: '2px solid #0a0820',
    borderRadius: '2px',
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    gap: '10px',
    padding: '14px 8px',
    color: '#f5ecd9',
    position: 'relative',
    overflow: 'hidden',
    cursor: 'pointer',
  },
  glassColorFields: {
    position: 'absolute', inset: 0,
    pointerEvents: 'none',
    zIndex: 0,
  },
  leadLines: {
    position: 'absolute', inset: 0,
    width: '100%', height: '100%',
    pointerEvents: 'none',
    zIndex: 1,
  },
  glassInnerGlow: {
    position: 'absolute', inset: 0,
    pointerEvents: 'none',
    zIndex: 2,
    transition: 'opacity 1.4s ease',
  },
  glassContent: {
    position: 'relative', zIndex: 3,
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    gap: '10px',
  },
  glassIcon: {
    width: '42px', height: '42px',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    filter: 'drop-shadow(0 0 6px rgba(240, 192, 96, 0.5))',
  },
  glassLabel: {
    fontFamily: "'Cormorant Garamond', serif",
    fontSize: '15px',
    fontWeight: 500,
    letterSpacing: '0.03em',
    textAlign: 'center',
    lineHeight: 1.15,
    color: '#f5ecd9',
    textShadow: '0 1px 2px rgba(0,0,0,0.5)',
  },
  glassCount: {
    position: 'absolute',
    top: '6px', right: '6px',
    minWidth: '20px', height: '20px',
    padding: '0 6px',
    borderRadius: '10px',
    fontSize: '11px', fontWeight: 700,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: 'Georgia, serif',
  },

  // Sub drawer (when a panel is tapped)
  subDrawer: {
    gridColumn: '1 / -1',
    marginTop: '4px',
    marginBottom: '4px',
    background: 'rgba(15, 12, 36, 0.7)',
    border: '1px solid rgba(240, 192, 96, 0.2)',
    backdropFilter: 'blur(10px)',
    padding: '20px',
  },
  subDrawerHeader: {
    display: 'flex', alignItems: 'center', gap: '12px',
    marginBottom: '16px',
    paddingBottom: '12px',
    borderBottom: '1px solid rgba(240, 192, 96, 0.15)',
  },
  subDrawerLabel: {
    flex: 1,
    fontFamily: "'Cormorant Garamond', serif",
    fontSize: '18px', fontWeight: 500,
    letterSpacing: '0.05em',
  },
  subClose: {
    background: 'none', border: 'none',
    color: 'rgba(245, 236, 217, 0.5)',
    fontSize: '18px', cursor: 'pointer', padding: '4px 8px',
  },
  subGrid: {
    display: 'flex', flexWrap: 'wrap', gap: '8px',
  },
  subGlassBtn: {
    padding: '8px 14px',
    border: '1px solid rgba(245, 236, 217, 0.2)',
    borderRadius: '20px',
    background: 'transparent',
    fontFamily: "'EB Garamond', Georgia, serif",
    fontSize: '14px',
    color: 'rgba(245, 236, 217, 0.7)',
  },

  // Input
  inputSection: { marginBottom: '24px' },
  textarea: {
    width: '100%',
    padding: '20px',
    fontSize: '16px',
    lineHeight: 1.6,
    fontFamily: "'EB Garamond', Georgia, serif",
    background: 'rgba(15, 12, 36, 0.5)',
    border: '1px solid rgba(240, 192, 96, 0.2)',
    borderRadius: '2px',
    resize: 'vertical',
    color: '#f5ecd9',
    transition: 'border-color 0.2s',
  },

  error: {
    margin: '16px 0', padding: '14px 18px',
    background: 'rgba(212, 74, 74, 0.1)',
    color: '#f5b8b8', textAlign: 'center',
    fontStyle: 'italic',
    border: '1px solid rgba(212, 74, 74, 0.3)',
  },

  // Sticky bottom bar
  bottomBar: {
    position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 30,
    background: 'rgba(8, 6, 26, 0.92)',
    backdropFilter: 'blur(20px)',
    borderTop: '1px solid rgba(240, 192, 96, 0.15)',
    boxShadow: '0 -8px 32px rgba(0, 0, 0, 0.4)',
  },
  bottomBarInner: {
    maxWidth: '480px', margin: '0 auto',
    padding: '16px 20px',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    gap: '12px', flexWrap: 'wrap',
  },
  bottomCount: {
    fontFamily: "'Cormorant Garamond', serif",
    fontStyle: 'italic',
    color: '#f0c060',
    fontSize: '14px',
    letterSpacing: '0.1em',
  },
  primaryBtn: {
    padding: '14px 32px',
    fontFamily: "'Cormorant Garamond', serif",
    fontSize: '14px',
    fontWeight: 500,
    letterSpacing: '0.25em',
    textTransform: 'uppercase',
    background: 'linear-gradient(135deg, #d9a040 0%, #8b1a1a 100%)',
    color: '#f5ecd9',
    border: '1px solid #f0c060',
    borderRadius: '2px',
    cursor: 'pointer',
    boxShadow: '0 0 20px rgba(240, 192, 96, 0.25)',
  },
  ghostBtn: {
    padding: '14px 24px',
    fontFamily: "'Cormorant Garamond', serif",
    fontSize: '13px',
    letterSpacing: '0.2em',
    textTransform: 'uppercase',
    background: 'transparent',
    color: 'rgba(245, 236, 217, 0.7)',
    border: '1px solid rgba(245, 236, 217, 0.2)',
    borderRadius: '2px',
    cursor: 'pointer',
  },

  // Response view
  responseMain: {
    maxWidth: '520px', margin: '0 auto',
    padding: '32px 16px 20px',
  },
  responseCard: {
    background: '#f5ecd9',
    boxShadow: '0 20px 80px rgba(0, 0, 0, 0.5), 0 0 100px rgba(240, 192, 96, 0.15)',
    border: '2px solid #0a0820',
    overflow: 'hidden',
    position: 'relative',
  },
  responseImageFrame: {
    width: '100%',
    borderBottom: '3px solid #0a0820',
    background: '#1a1530',
    position: 'relative',
    boxShadow: 'inset 0 -20px 40px rgba(240, 192, 96, 0.06)',
  },
  illustrationInner: {
    width: '100%', aspectRatio: '8 / 5', overflow: 'hidden', lineHeight: 0, display: 'block',
  },
  responseInner: {
    padding: '40px 28px 36px',
    color: '#3d2817',
  },
  responseOrnamentTop: {
    display: 'flex', alignItems: 'center', gap: '16px',
    marginBottom: '32px',
  },
  ornLine: {
    flex: 1, height: '1px',
    background: 'linear-gradient(to right, transparent, #8b6f47, transparent)',
  },
  ornSymbol: { color: '#8b1a1a', fontSize: '18px' },
  responseQuotes: {
    display: 'flex', flexDirection: 'column',
    gap: '28px', marginBottom: '32px',
  },
  responseQuote: {
    margin: 0, paddingLeft: '20px',
    borderLeft: '2px solid #8b1a1a',
  },
  responseQuoteText: {
    fontFamily: "'Cormorant Garamond', serif",
    fontSize: '22px',
    fontStyle: 'italic',
    color: '#8b1a1a',
    lineHeight: 1.45,
    margin: '0 0 10px',
    fontWeight: 500,
  },
  responseQuoteMeta: {
    display: 'flex', flexDirection: 'column', gap: '4px',
  },
  responseSpeaker: {
    fontFamily: "'Cormorant Garamond', serif",
    fontSize: '13px',
    fontWeight: 600,
    letterSpacing: '0.25em',
    textTransform: 'uppercase',
    color: '#8b1a1a',
  },
  responseRef: {
    fontFamily: "'Cormorant Garamond', serif",
    fontSize: '12px',
    letterSpacing: '0.2em',
    textTransform: 'uppercase',
    color: '#8b6f47',
  },
  responseContext: {
    fontSize: '13px', fontStyle: 'italic',
    color: '#6b5436', lineHeight: 1.5,
    marginTop: '2px',
  },
  responseDivider: {
    display: 'flex', alignItems: 'center', gap: '16px',
    margin: '4px 0 24px',
  },
  jesusVoiceLabel: {
    margin: '0 0 16px',
    fontFamily: "'Cormorant Garamond', serif",
    fontStyle: 'italic',
    fontSize: '15px',
    letterSpacing: '0.15em',
    color: '#8b1a1a',
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  responseProse: {
    fontSize: '18px',
    lineHeight: 1.85,
    color: '#3d2817',
    fontStyle: 'italic',
    margin: 0,
    textAlign: 'justify',
  },
  disclaimer: {
    margin: '16px 0 0',
    padding: '16px 20px',
    background: 'rgba(245, 236, 217, 0.05)',
    border: '1px solid rgba(245, 236, 217, 0.15)',
    fontSize: '12px',
    fontStyle: 'italic',
    color: 'rgba(245, 236, 217, 0.55)',
    textAlign: 'center',
    lineHeight: 1.6,
  },

  // History
  historyMain: {
    maxWidth: '480px', margin: '0 auto',
    padding: '40px 20px 20px',
  },
  emptyState: { textAlign: 'center', padding: '40px 20px' },
  emptyOrn: {
    display: 'block', fontSize: '32px',
    color: '#f0c060', margin: '0 0 20px',
    opacity: 0.6,
  },
  emptyText: {
    fontFamily: "'Cormorant Garamond', serif",
    fontStyle: 'italic', fontSize: '17px',
    color: 'rgba(245, 236, 217, 0.6)',
    margin: '0 0 28px',
  },
  historyList: {
    display: 'flex', flexDirection: 'column', gap: '20px',
  },
  historyCard: {
    background: 'rgba(15, 12, 36, 0.6)',
    border: '1px solid rgba(240, 192, 96, 0.15)',
    padding: '24px',
  },
  historyMeta: {
    display: 'flex', flexDirection: 'column', gap: '4px',
    marginBottom: '16px',
  },
  historyDate: {
    fontSize: '11px', letterSpacing: '0.25em',
    textTransform: 'uppercase',
    color: 'rgba(240, 192, 96, 0.7)',
  },
  historyMood: {
    fontFamily: "'Cormorant Garamond', serif",
    fontStyle: 'italic', fontSize: '14px',
    color: 'rgba(245, 236, 217, 0.7)',
  },
  historyInput: {
    margin: '0 0 16px', fontSize: '15px',
    color: 'rgba(245, 236, 217, 0.65)',
    fontStyle: 'italic', paddingBottom: '14px',
    borderBottom: '1px solid rgba(245, 236, 217, 0.1)',
  },
  historyImageFrame: {
    width: '100%', marginBottom: '16px',
    border: '2px solid #0a0820',
  },
  historyQuote: {
    margin: '0 0 12px', paddingLeft: '14px',
    borderLeft: '2px solid #f0c060',
  },
  historyQuoteText: {
    fontFamily: "'Cormorant Garamond', serif",
    fontSize: '17px', fontStyle: 'italic',
    color: '#f0c060', lineHeight: 1.45,
    margin: '0 0 4px',
  },
  historyRef: {
    fontSize: '11px', letterSpacing: '0.2em',
    color: 'rgba(245, 236, 217, 0.5)',
    textTransform: 'uppercase',
  },
  historyResponse: {
    fontSize: '15px', lineHeight: 1.7,
    color: 'rgba(245, 236, 217, 0.85)',
    fontStyle: 'italic', margin: '16px 0 20px',
  },
  historyActions: {
    display: 'flex', gap: '20px',
    paddingTop: '14px',
    borderTop: '1px solid rgba(245, 236, 217, 0.1)',
  },
  historyAction: {
    background: 'none', border: 'none',
    fontFamily: "'Cormorant Garamond', serif",
    fontSize: '12px',
    letterSpacing: '0.2em', textTransform: 'uppercase',
    color: 'rgba(245, 236, 217, 0.6)',
    cursor: 'pointer', padding: 0,
  },

  // Modal
  modalOverlay: {
    position: 'fixed', inset: 0,
    background: 'rgba(0, 0, 0, 0.92)',
    backdropFilter: 'blur(10px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 100, padding: '20px',
  },
  modalContent: {
    background: '#0f0c24',
    border: '1px solid rgba(240, 192, 96, 0.3)',
    maxWidth: '560px', width: '100%',
    maxHeight: '90vh', overflowY: 'auto',
    padding: '32px 24px',
    position: 'relative',
    display: 'flex', flexDirection: 'column', gap: '20px',
    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.6)',
  },
  modalClose: {
    position: 'absolute', top: '12px', right: '12px',
    background: 'none', border: 'none',
    fontSize: '28px', color: 'rgba(245, 236, 217, 0.6)',
    cursor: 'pointer', width: '36px', height: '36px',
    lineHeight: 1, padding: 0,
  },
  modalImage: {
    width: '100%',
    height: 'auto',
    display: 'block',
    WebkitTouchCallout: 'default',
    WebkitUserSelect: 'auto',
    userSelect: 'auto',
    pointerEvents: 'auto',
  },
  saveInstructions: {
    padding: '20px',
    background: 'rgba(240, 192, 96, 0.06)',
    border: '1px solid rgba(240, 192, 96, 0.2)',
    borderRadius: '2px',
  },
  saveInstructionsTitle: {
    margin: '0 0 12px',
    fontFamily: "'Cormorant Garamond', serif",
    fontSize: '14px',
    letterSpacing: '0.2em',
    textTransform: 'uppercase',
    color: '#f0c060',
    textAlign: 'center',
  },
  saveInstructionsBody: {
    margin: 0,
    fontSize: '14px',
    lineHeight: 1.7,
    color: 'rgba(245, 236, 217, 0.8)',
    textAlign: 'center',
  },
  modalHint: {
    margin: 0, fontSize: '13px', fontStyle: 'italic',
    color: 'rgba(245, 236, 217, 0.6)',
    textAlign: 'center',
  },
  modalActions: {
    display: 'flex', gap: '12px',
    justifyContent: 'center', flexWrap: 'wrap',
  },

  // Response toolbar (favorite, read aloud, share)
  responseToolbar: {
    display: 'flex', gap: '8px',
    justifyContent: 'center', alignItems: 'center',
    marginTop: '32px', paddingTop: '20px',
    borderTop: '1px solid rgba(139,111,71,0.2)',
    flexWrap: 'wrap',
  },
  toolbarBtn: {
    display: 'inline-flex', alignItems: 'center', gap: '6px',
    padding: '8px 14px',
    background: 'transparent',
    border: '1px solid rgba(139,111,71,0.3)',
    borderRadius: '20px',
    cursor: 'pointer',
    fontFamily: "'Cormorant Garamond', serif",
    fontSize: '13px', letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: '#6b5436',
  },

  // Reflection
  reflectionSection: {
    marginTop: '24px', padding: '24px',
    background: 'rgba(15, 12, 36, 0.5)',
    border: '1px solid rgba(240, 192, 96, 0.18)',
  },
  reflectionLabel: {
    margin: '0 0 12px',
    fontFamily: "'Cormorant Garamond', serif",
    fontSize: '14px',
    letterSpacing: '0.25em', textTransform: 'uppercase',
    color: '#f0c060',
    textAlign: 'center',
  },
  reflectionInput: {
    width: '100%', padding: '16px',
    fontSize: '15px', lineHeight: 1.6,
    fontFamily: "'EB Garamond', Georgia, serif",
    fontStyle: 'italic',
    background: 'rgba(8, 6, 26, 0.4)',
    border: '1px solid rgba(240, 192, 96, 0.2)',
    borderRadius: '2px', resize: 'vertical',
    color: '#f5ecd9',
  },

  // History controls (tabs + search)
  historyControls: {
    marginBottom: '24px',
  },
  historyTabs: {
    display: 'flex', gap: '4px',
    borderBottom: '1px solid rgba(240, 192, 96, 0.15)',
    marginBottom: '16px',
  },
  historyTab: {
    background: 'transparent', border: 'none',
    padding: '12px 16px',
    fontFamily: "'Cormorant Garamond', serif",
    fontSize: '13px', letterSpacing: '0.2em',
    textTransform: 'uppercase', cursor: 'pointer',
    borderBottom: '2px solid transparent',
    transition: 'color 0.2s, border-color 0.2s',
  },
  historySearchInput: {
    width: '100%', padding: '12px 16px',
    fontSize: '15px',
    fontFamily: "'EB Garamond', Georgia, serif",
    background: 'rgba(15, 12, 36, 0.5)',
    border: '1px solid rgba(240, 192, 96, 0.2)',
    borderRadius: '2px',
    color: '#f5ecd9',
  },
  noResults: {
    textAlign: 'center',
    fontStyle: 'italic',
    color: 'rgba(245, 236, 217, 0.5)',
    padding: '40px 20px',
  },

  // History card extras
  historyHeaderRow: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
    marginBottom: '12px', gap: '12px',
  },
  historyFavBtn: {
    background: 'transparent', border: 'none', cursor: 'pointer',
    padding: '4px 8px', lineHeight: 1,
  },
  historyReflection: {
    marginTop: '16px', padding: '14px 16px',
    background: 'rgba(240, 192, 96, 0.06)',
    border: '1px solid rgba(240, 192, 96, 0.15)',
    borderRadius: '2px',
  },
  historyReflectionLabel: {
    margin: '0 0 6px',
    fontFamily: "'Cormorant Garamond', serif",
    fontSize: '10px', letterSpacing: '0.3em',
    color: '#f0c060',
  },
  historyReflectionText: {
    margin: 0, fontSize: '14px',
    fontStyle: 'italic', lineHeight: 1.6,
    color: 'rgba(245, 236, 217, 0.85)',
  },

  // Daily prompt modal
  dailyPromptContent: {
    background: '#0f0c24',
    border: '1px solid rgba(240, 192, 96, 0.4)',
    maxWidth: '400px', width: '100%',
    padding: '40px 32px',
    textAlign: 'center',
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', gap: '20px',
    boxShadow: '0 20px 60px rgba(0,0,0,0.6), 0 0 80px rgba(240,192,96,0.15)',
  },
  dailyPromptOrnament: {
    fontSize: '36px', color: '#f0c060',
    filter: 'drop-shadow(0 0 12px rgba(240, 192, 96, 0.5))',
  },
  dailyPromptTitle: {
    margin: 0,
    fontFamily: "'Cormorant Garamond', serif",
    fontWeight: 500, fontSize: '32px',
    color: '#f5ecd9', letterSpacing: '0.05em',
  },
  dailyPromptBody: {
    margin: 0,
    fontFamily: "'EB Garamond', Georgia, serif",
    fontStyle: 'italic', fontSize: '17px',
    color: 'rgba(245, 236, 217, 0.85)',
    lineHeight: 1.6,
  },
  dailyPromptDismiss: {
    background: 'transparent', border: 'none',
    fontFamily: "'Cormorant Garamond', serif",
    fontSize: '12px', letterSpacing: '0.2em',
    textTransform: 'uppercase',
    color: 'rgba(245, 236, 217, 0.5)',
    cursor: 'pointer', padding: '8px 16px',
  },

  // In-app toast
  toast: {
    position: 'fixed', bottom: '32px', left: '50%',
    transform: 'translateX(-50%)',
    background: 'rgba(15, 12, 36, 0.94)',
    border: '1px solid rgba(240, 192, 96, 0.35)',
    backdropFilter: 'blur(10px)',
    color: '#f5ecd9',
    padding: '14px 22px',
    borderRadius: '2px',
    fontFamily: "'EB Garamond', Georgia, serif",
    fontSize: '15px',
    letterSpacing: '0.02em',
    boxShadow: '0 8px 32px rgba(0,0,0,0.4), 0 0 24px rgba(240, 192, 96, 0.12)',
    zIndex: 400,
    maxWidth: 'calc(100% - 40px)',
    textAlign: 'center',
    animation: 'toastIn 0.4s ease-out both',
  },
};
