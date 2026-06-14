// Hardened proxy for Anthropic API.
// Holds the API key (server-side only — never reaches the browser),
// rate-limits per IP, validates payload shape, and restricts allowed origins.

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 8;
const DAILY_LIMIT_PER_IP = 60;
const MAX_TOKENS_CAP = 2500;
const ALLOWED_MODELS = new Set([
  'claude-sonnet-4-20250514',
  'claude-sonnet-4-5',
  'claude-haiku-4-5',
]);

const rateLimitStore = new Map();

function getClientIP(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown';
}

function checkRateLimit(ip) {
  const now = Date.now();
  let entry = rateLimitStore.get(ip);

  if (!entry) {
    entry = { minuteCount: 0, minuteResetAt: now + RATE_LIMIT_WINDOW_MS, dayCount: 0, dayResetAt: now + 24 * 60 * 60 * 1000 };
    rateLimitStore.set(ip, entry);
  }

  if (now > entry.minuteResetAt) {
    entry.minuteCount = 0;
    entry.minuteResetAt = now + RATE_LIMIT_WINDOW_MS;
  }
  if (now > entry.dayResetAt) {
    entry.dayCount = 0;
    entry.dayResetAt = now + 24 * 60 * 60 * 1000;
  }

  if (entry.minuteCount >= RATE_LIMIT_MAX_REQUESTS) {
    return { allowed: false, reason: 'too many requests this minute' };
  }
  if (entry.dayCount >= DAILY_LIMIT_PER_IP) {
    return { allowed: false, reason: 'daily limit reached' };
  }

  entry.minuteCount++;
  entry.dayCount++;

  if (rateLimitStore.size > 5000) {
    const cutoff = now - 24 * 60 * 60 * 1000;
    for (const [k, v] of rateLimitStore.entries()) {
      if (v.dayResetAt < cutoff) rateLimitStore.delete(k);
    }
  }

  return { allowed: true };
}

function validatePayload(body) {
  if (!body || typeof body !== 'object') return 'body must be a JSON object';
  if (!body.model || typeof body.model !== 'string') return 'model is required';
  if (!ALLOWED_MODELS.has(body.model)) return 'model not allowed';
  if (typeof body.max_tokens !== 'number' || body.max_tokens < 1) return 'max_tokens must be a positive number';
  if (body.max_tokens > MAX_TOKENS_CAP) return `max_tokens cannot exceed ${MAX_TOKENS_CAP}`;
  if (!Array.isArray(body.messages) || body.messages.length === 0) return 'messages array is required';
  if (body.messages.length > 4) return 'messages array too long';
  for (const m of body.messages) {
    if (!m.role || !m.content) return 'each message needs role and content';
    if (typeof m.content === 'string' && m.content.length > 20000) return 'message content too long';
  }
  return null;
}

export default async function handler(req, res) {
  const origin = req.headers.origin || '';
  const allowedOriginPattern = /^https:\/\/.*\.vercel\.app$|^https:\/\/.*\.(com|org|net|io|app)$/;
  const isAllowedOrigin = !origin || allowedOriginPattern.test(origin);

  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'API key not configured on server' });
  }

  const referer = req.headers.referer || '';
  if (referer && !allowedOriginPattern.test(referer.split('/').slice(0, 3).join('/'))) {
    console.warn('Suspicious referer:', referer);
  }

  const ip = getClientIP(req);
  const rateCheck = checkRateLimit(ip);
  if (!rateCheck.allowed) {
    return res.status(429).json({ error: 'Rate limit exceeded', detail: rateCheck.reason });
  }

  const validationError = validatePayload(req.body);
  if (validationError) {
    return res.status(400).json({ error: 'Invalid request', detail: validationError });
  }

  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(req.body),
    });

    const data = await upstream.json();

    if (isAllowedOrigin && origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    }

    res.status(upstream.status).json(data);
  } catch (err) {
    console.error('Upstream request failed:', err);
    res.status(502).json({ error: 'Upstream request failed', detail: String(err) });
  }
}
