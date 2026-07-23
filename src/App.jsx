import React, { useState, useEffect, useRef } from 'react';

// Your Cloudflare Worker URL — the proxy that hides your API key
const API_URL = 'https://tproxy.troykeur.workers.dev';

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
  const speechRef = useRef(null);

  useEffect(() => {
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
          setTimeout(() => setShowDailyPrompt(true), 1500);
        }
      } catch (e) { console.warn('Initial load failed:', e); }
    })();

    // Cleanup speech synthesis on unmount
    return () => {
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const dismissDailyPrompt = async () => {
    setShowDailyPrompt(false);
    try { await storage.set('lastDailyPrompt', new Date().toDateString()); } catch (e) {}
  };

  const togglePanel = (moodId) => {
    setActivePanels(prev => {
      const next = new Set(prev);
      if (next.has(moodId)) next.delete(moodId);
      else next.add(moodId);
      return next;
    });
  };

  const toggleSelection = (key) => {
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
    setInput('');
    setSelections(new Set());
    setActivePanels(new Set());
    setResponse(null);
    setError(null);
    setStep('home');
    window.scrollTo({ top: 0, behavior: 'smooth' });
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
          model: "claude-sonnet-4-20250514",
          max_tokens: 1500,
          messages: [{
            role: "user",
            content: `A person has come with this:

${userContext}

Provide spiritual counsel rooted in the New Testament. Include 3-4 quotes total, drawn from a mix of sources:

**Required:**
- AT LEAST ONE quote must be from Jesus himself (red-letter words from the Gospels — sayings, parables, the Sermon on the Mount, the Beatitudes, conversations with disciples).
- THE OTHER quotes may come from: Paul (Romans, Corinthians, Galatians, Ephesians, Philippians, Colossians, Thessalonians, Timothy, Titus, Philemon), Peter (1 & 2 Peter), James, John (1, 2, 3 John), Jude, Hebrews, Acts (Stephen, Apollos, Barnabas, etc.), or other recorded New Testament voices.
- Do NOT invent quotes. Only use actual recorded scripture.

**Avoid these references already used:** ${avoidList || 'none yet'}

**Format the speaker correctly:**
- For Jesus's words, set "speaker" to "Jesus"
- For others, use their name as the speaker (e.g., "Paul", "Peter", "James", "John", "the author of Hebrews", "Stephen")

**The FINAL response must be in Jesus's voice** — a gentle pastoral word as if Jesus himself is speaking directly to this person. It may echo or extend the themes from the other quotes, but the voice and authority is his.

Return ONLY a JSON object (no markdown, no code fences):

{
  "quotes": [
    {
      "text": "the actual quote",
      "reference": "Book Chapter:Verse",
      "speaker": "Jesus" or "Paul" or "Peter" etc.,
      "context": "one short sentence on what was happening or the situation of the writing"
    }
  ],
  "response": "a gentle pastoral response in Jesus's voice, 3-5 sentences, speaking directly to the person",
  "theme": "2-4 visual keywords"
}

Order quotes thoughtfully — often it's powerful to lead with another NT voice setting up the situation, and let Jesus's words land last among the quotes, before his final pastoral response. Range widely across the New Testament.`
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
      setResponse(entry);
      setStep('response');
      setReflection(entry.reflection || ''); // load any existing reflection
      window.scrollTo({ top: 0, behavior: 'smooth' });

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
          model: "claude-sonnet-4-20250514",
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
      if (favorites.has(id)) {
        const next = new Set(favorites);
        next.delete(id);
        setFavorites(next);
        try { await storage.set('favorites', JSON.stringify(Array.from(next))); } catch (e) {}
      }
    } catch (e) { console.warn('Delete failed:', e); }
  };

  // === FAVORITES ===
  const toggleFavorite = async (id) => {
    const next = new Set(favorites);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setFavorites(next);
    try { await storage.set('favorites', JSON.stringify(Array.from(next))); }
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
        alert('Word copied to clipboard.');
      } else {
        // Final fallback: select and prompt
        prompt('Copy this:', text);
      }
    } catch (err) {
      if (err.name !== 'AbortError') console.warn('Share failed:', err);
    }
  };

  // === AUDIO READ-ALOUD ===
  const readAloud = (entry) => {
    if (!('speechSynthesis' in window)) {
      alert('Read-aloud is not supported in this browser.');
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

    const utterance = new SpeechSynthesisUtterance(parts.join('. '));
    utterance.rate = 0.88;
    utterance.pitch = 0.95;
    utterance.volume = 1;

    // Try to pick a calm voice
    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find(v =>
      /en-(US|GB)/.test(v.lang) && /Daniel|Karen|Samantha|Google US English|en-US/.test(v.name)
    ) || voices.find(v => /en/i.test(v.lang));
    if (preferred) utterance.voice = preferred;

    utterance.onend = () => setReadingAloud(false);
    utterance.onerror = () => setReadingAloud(false);

    speechRef.current = utterance;
    window.speechSynthesis.speak(utterance);
    setReadingAloud(true);
  };

  // === REFLECTION ===
  const saveReflection = async () => {
    if (!response || !reflection.trim()) return;
    const updated = { ...response, reflection: reflection.trim() };
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

        @keyframes lightBeam {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 0.6; }
        }
        .light-beam { animation: lightBeam 4s ease-in-out infinite; }

        @keyframes slowGlow {
          0%, 100% { box-shadow: 0 0 20px var(--glow), inset 0 0 30px rgba(255,255,255,0.05); }
          50% { box-shadow: 0 0 32px var(--glow), inset 0 0 40px rgba(255,255,255,0.1); }
        }
        .glass-selected { animation: slowGlow 3s ease-in-out infinite; }

        @keyframes responseEnter {
          0% { opacity: 0; transform: translateY(40px) scale(0.96); filter: blur(8px); }
          100% { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
        }
        .response-enter { animation: responseEnter 1.4s cubic-bezier(0.16, 1, 0.3, 1) both; }

        @keyframes quoteReveal {
          from { opacity: 0; transform: translateX(-12px); }
          to { opacity: 1; transform: translateX(0); }
        }
        .quote-reveal { animation: quoteReveal 1s ease-out both; }
        .quote-r-1 { animation-delay: 0.5s; }
        .quote-r-2 { animation-delay: 0.9s; }
        .quote-r-3 { animation-delay: 1.3s; }

        @keyframes pulse {
          0%, 100% { opacity: 0.4; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.1); }
        }
        .pulse-dot span { animation: pulse 1.4s ease-in-out infinite; }
        .pulse-dot span:nth-child(2) { animation-delay: 0.2s; }
        .pulse-dot span:nth-child(3) { animation-delay: 0.4s; }

        .panel-btn {
          transition: transform 0.2s, box-shadow 0.3s, filter 0.3s;
          cursor: pointer;
        }
        .panel-btn:active { transform: scale(0.97); }
        .panel-btn:hover { filter: brightness(1.2); }

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
        }

        .drop-cap-illuminated::first-letter {
          font-family: 'UnifrakturMaguntia', serif;
          font-size: 88px; float: left; line-height: 0.78;
          padding: 8px 14px 0 0; color: #8b1a1a;
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

      {view === 'main' ? (
        <>
          {step === 'home' && (
            <main style={S.main} className="light-rays">
              {/* Hero intro */}
              <section style={S.hero}>
                <p style={S.heroEyebrow}>Bring what you carry</p>
                <h2 style={S.heroHeadline}>
                  Speak. <em style={S.heroEm}>Receive a word</em><br/>
                  from the Gospels.
                </h2>
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
                    // Track which rows have open drawers so we can insert them after the right row
                    for (let i = 0; i < MOODS.length; i++) {
                      const mood = MOODS[i];
                      const count = countMoodSelections(mood.id);
                      const isActive = activePanels.has(mood.id);
                      items.push(
                        <button
                          key={`panel-${mood.id}`}
                          className="panel-btn panel"
                          onClick={() => togglePanel(mood.id)}
                          style={{
                            ...S.glassPanel,
                            background: `radial-gradient(ellipse at 30% 30%, ${mood.glow}40 0%, ${mood.jewel} 50%, ${mood.jewel}dd 100%)`,
                            boxShadow: count > 0
                              ? `0 0 24px ${mood.glow}, inset 0 0 20px rgba(255,255,255,0.15)`
                              : `inset 0 0 12px rgba(0,0,0,0.4)`,
                            animationDelay: `${i * 0.04}s`,
                            border: isActive ? `2px solid ${mood.glow}` : `2px solid #0a0820`,
                          }}
                        >
                          <span style={S.glassIcon}>{mood.icon}</span>
                          <span style={S.glassLabel}>{mood.label}</span>
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
                                <span>{mood.icon}</span>
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
              <article style={S.responseCard} className="response-enter">
                {response.illustration && (
                  <div style={S.responseImageFrame}>
                    <div dangerouslySetInnerHTML={{ __html: response.illustration }} style={S.illustrationInner} />
                  </div>
                )}

                <div style={S.responseInner}>
                  <div style={S.responseOrnamentTop}>
                    <span style={S.ornLine}></span>
                    <span style={S.ornSymbol}>✦</span>
                    <span style={S.ornLine}></span>
                  </div>

                  <div style={S.responseQuotes}>
                    {response.quotes.map((q, i) => {
                      const isJesus = (q.speaker || 'Jesus').toLowerCase() === 'jesus';
                      return (
                        <blockquote
                          key={i}
                          style={{
                            ...S.responseQuote,
                            borderLeftColor: isJesus ? '#8b1a1a' : '#8b6f47',
                          }}
                          className={`quote-reveal quote-r-${i+1}`}
                        >
                          <p style={{
                            ...S.responseQuoteText,
                            color: isJesus ? '#8b1a1a' : '#5a4a2a',
                          }}>"{q.text}"</p>
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

                  <div style={S.responseDivider}>
                    <span style={S.ornLine}></span>
                    <span style={S.ornSymbol}>✦</span>
                    <span style={S.ornLine}></span>
                  </div>

                  <p style={S.jesusVoiceLabel}>And Jesus says to you —</p>

                  <p style={S.responseProse} className="drop-cap-illuminated">{response.response}</p>

                  <div style={S.responseToolbar}>
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

      {/* IMAGE PREVIEW MODAL */}
      {/* DAILY PROMPT MODAL */}
      {showDailyPrompt && view === 'main' && step === 'home' && (
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
  heroEm: {
    color: '#f0c060',
    fontStyle: 'italic',
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
  },
  glassIcon: {
    fontSize: '28px',
    filter: 'drop-shadow(0 0 6px rgba(255,255,255,0.4))',
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
    borderBottom: '2px solid #0a0820',
    background: '#1a1530',
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
};
