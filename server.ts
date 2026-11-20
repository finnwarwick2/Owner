import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

const VALID_TIERS = new Set([
  'INVALID',
  'COMMON',
  'FAKE_DEEP',
  'UNCOMMON',
  'RARE',
  'LEGENDARY',
]);

let geminiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  if (!geminiClient) {
    geminiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return geminiClient;
}

function getStripeSecretKey(): string | null {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  return key ? key : null;
}

function resolveBaseUrl(req: express.Request): string {
  const proto =
    (req.headers['x-forwarded-proto'] as string | undefined)?.split(',')[0]?.trim() ||
    req.protocol ||
    'http';
  const host = req.get('host');
  if (host) {
    return `${proto}://${host}`;
  }
  const envUrl = process.env.APP_URL?.trim();
  if (envUrl && envUrl !== 'MY_APP_URL') {
    return envUrl.replace(/\/$/, '');
  }
  return `http://localhost:${PORT}`;
}

async function createApp() {
  const app = express();
  app.use(express.json({ limit: '64kb' }));

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      geminiConfigured: Boolean(getGeminiClient()),
      stripeConfigured: Boolean(getStripeSecretKey()),
    });
  });

  app.post('/api/judge', async (req, res) => {
    try {
      const { promptText, category, answer, edition } = req.body ?? {};
      if (typeof promptText !== 'string' || typeof answer !== 'string') {
        res.status(400).json({ error: 'promptText and answer are required strings.' });
        return;
      }

      const trimmedAnswer = answer.trim();
      if (!trimmedAnswer) {
        res.json({
          valid: false,
          tier: 'INVALID',
          reason: 'Silence never caught a train in its life.',
          source: 'validation',
        });
        return;
      }

      const ai = getGeminiClient();
      if (!ai) {
        res.status(503).json({ error: 'Gemini API key is not configured on the server.' });
        return;
      }

      const gameLabel = edition === 'next-stop-europe' ? 'NEXT STOP EUROPE' : 'NEXT STOP';
      const systemInstruction = `You are the deadpan, witty railway stationmaster judging answers for the daily trivia game "${gameLabel}".
For a given prompt and player answer, judge two things:
1. VALIDITY: Be strict on validity. No made-up words, gibberish, or things that do not fit the prompt category. Minor spelling mistakes or typos are fine if the intended real-world answer is clearly identifiable.
2. RARITY TIER (only if valid; if invalid use "INVALID"):
- "COMMON": Top-of-mind obvious answers almost everyone says first.
- "FAKE_DEEP": The cliché "clever" or quirky answer people reach for when trying to sound obscure (e.g. "Gruyere" or "Gouda" for cheese, "Cockfosters" or "Mornington Crescent" for London Tube, "Platypus" for mammal, "Bhutan" for country).
- "UNCOMMON": Solid real answer that most casual players wouldn't immediately blurt out.
- "RARE": Genuinely niche, regional, or deep-cut knowledge.
- "LEGENDARY": Astonishingly obscure yet 100% real and accurate for the prompt.

Write a short, funny, punchy one-line reason (max 14 words) in character as a dry railway announcer. No markdown, no quotes around the whole line.`;

      const userPrompt = `Edition: ${gameLabel}
Category: ${typeof category === 'string' ? category : 'General'}
Prompt: "${promptText}"
Player answer: "${trimmedAnswer.slice(0, 120)}"`;

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: userPrompt,
        config: {
          systemInstruction,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              valid: {
                type: Type.BOOLEAN,
                description: 'True if the answer is a real, valid fit for the prompt.',
              },
              tier: {
                type: Type.STRING,
                description: 'One of INVALID, COMMON, FAKE_DEEP, UNCOMMON, RARE, LEGENDARY.',
              },
              reason: {
                type: Type.STRING,
                description: 'Short funny one-line reason from the railway judge.',
              },
            },
            required: ['valid', 'tier', 'reason'],
          },
        },
      });

      const rawText = (response.text ?? '').trim();
      if (!rawText) {
        res.status(502).json({ error: 'Empty response from Gemini API.' });
        return;
      }

      const parsed = JSON.parse(rawText) as {
        valid?: boolean;
        tier?: string;
        reason?: string;
      };

      const isValid = Boolean(parsed.valid);
      let normalizedTier = String(parsed.tier ?? 'INVALID').toUpperCase().trim();
      if (!VALID_TIERS.has(normalizedTier)) {
        normalizedTier = isValid ? 'COMMON' : 'INVALID';
      }
      if (!isValid) {
        normalizedTier = 'INVALID';
      } else if (normalizedTier === 'INVALID') {
        normalizedTier = 'COMMON';
      }

      const reason =
        typeof parsed.reason === 'string' && parsed.reason.trim().length > 0
          ? parsed.reason.trim().slice(0, 140)
          : isValid
            ? 'Ticket punched. Step lively onto the carriage.'
            : 'That ticket does not exist on any timetable.';

      res.json({
        valid: isValid,
        tier: normalizedTier,
        reason,
        source: 'gemini',
      });
    } catch (error) {
      console.error('Gemini /api/judge error:', error);
      res.status(502).json({
        error: error instanceof Error ? error.message : 'Failed to judge answer with Gemini.',
      });
    }
  });

  // Stripe Checkout configuration status (never exposes secret keys)
  app.get('/api/stripe/config', (_req, res) => {
    res.json({
      configured: Boolean(getStripeSecretKey()),
      publishableKey: process.env.VITE_STRIPE_PUBLISHABLE_KEY?.trim() || null,
      priceDisplay: '£1.99',
    });
  });

  // Create one-time Stripe Checkout Session (£1.99 GBP) for Next Stop Europe
  app.post('/api/stripe/create-checkout-session', async (req, res) => {
    const secretKey = getStripeSecretKey();
    if (!secretKey) {
      res.status(503).json({
        error: 'Stripe checkout is not configured yet (STRIPE_SECRET_KEY missing).',
      });
      return;
    }

    try {
      const origin = resolveBaseUrl(req);
      const email =
        typeof req.body?.email === 'string' && req.body.email.includes('@')
          ? req.body.email.trim()
          : undefined;
      const priceId = process.env.STRIPE_PRICE_ID_EUROPE?.trim();

      const params = new URLSearchParams();
      params.set('mode', 'payment');
      params.set(
        'success_url',
        `${origin}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      );
      params.set('cancel_url', `${origin}/?checkout=cancel`);
      params.set('metadata[product]', 'next-stop-europe');
      if (email) {
        params.set('customer_email', email);
      }

      if (priceId) {
        params.set('line_items[0][price]', priceId);
        params.set('line_items[0][quantity]', '1');
      } else {
        params.set('line_items[0][price_data][currency]', 'gbp');
        params.set('line_items[0][price_data][unit_amount]', '199');
        params.set(
          'line_items[0][price_data][product_data][name]',
          'OBSCURA ARCADE: NEXT STOP EUROPE',
        );
        params.set(
          'line_items[0][price_data][product_data][description]',
          'Unlimited daily access to the 40-station European Rail Trivia pass.',
        );
        params.set('line_items[0][quantity]', '1');
      }

      const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${secretKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });

      const payload = (await stripeRes.json()) as {
        id?: string;
        url?: string;
        error?: { message?: string };
      };
      if (!stripeRes.ok || !payload.url) {
        res.status(502).json({
          error: payload.error?.message || 'Unable to create Stripe Checkout session.',
        });
        return;
      }

      res.json({ sessionId: payload.id, url: payload.url });
    } catch (error) {
      console.error('Stripe checkout session error:', error);
      res.status(502).json({ error: 'Stripe Checkout request failed.' });
    }
  });

  // Verify completed Checkout Session on return redirect
  app.get('/api/stripe/verify-session', async (req, res) => {
    const sessionId = typeof req.query.session_id === 'string' ? req.query.session_id.trim() : '';
    if (!sessionId) {
      res.status(400).json({ unlocked: false, error: 'Missing session_id.' });
      return;
    }

    const secretKey = getStripeSecretKey();
    if (!secretKey) {
      res.status(503).json({ unlocked: false, error: 'Stripe is not configured on the server.' });
      return;
    }

    try {
      const stripeRes = await fetch(
        `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`,
        {
          headers: { Authorization: `Bearer ${secretKey}` },
        },
      );
      const session = (await stripeRes.json()) as {
        payment_status?: string;
        metadata?: { product?: string };
        customer_details?: { email?: string };
        error?: { message?: string };
      };

      if (!stripeRes.ok) {
        res.status(400).json({
          unlocked: false,
          error: session.error?.message || 'Invalid checkout session.',
        });
        return;
      }

      const paid =
        session.payment_status === 'paid' &&
        (!session.metadata?.product || session.metadata.product === 'next-stop-europe');

      res.json({
        unlocked: paid,
        email: session.customer_details?.email ?? null,
      });
    } catch (error) {
      console.error('Stripe verify-session error:', error);
      res.status(502).json({ unlocked: false, error: 'Failed to verify Stripe session.' });
    }
  });

  // Restore purchase by email via Stripe Checkout Sessions lookup
  app.post('/api/stripe/restore-purchase', async (req, res) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    if (!email || !email.includes('@')) {
      res.status(400).json({ unlocked: false, message: 'Enter a valid email address.' });
      return;
    }

    const secretKey = getStripeSecretKey();
    if (!secretKey) {
      res.status(503).json({
        unlocked: false,
        message: 'Stripe verification unavailable without server STRIPE_SECRET_KEY.',
      });
      return;
    }

    try {
      const url = new URL('https://api.stripe.com/v1/checkout/sessions');
      url.searchParams.set('limit', '20');
      url.searchParams.set('customer_details[email]', email);

      const stripeRes = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${secretKey}` },
      });
      const data = (await stripeRes.json()) as {
        data?: Array<{
          payment_status?: string;
          amount_total?: number;
          metadata?: { product?: string };
          customer_details?: { email?: string };
        }>;
        error?: { message?: string };
      };

      if (!stripeRes.ok) {
        res.status(502).json({
          unlocked: false,
          message: data.error?.message || 'Stripe lookup failed.',
        });
        return;
      }

      const match = (data.data ?? []).find(
        (s) =>
          s.payment_status === 'paid' &&
          (s.metadata?.product === 'next-stop-europe' || s.amount_total === 199),
      );

      if (match) {
        res.json({
          unlocked: true,
          email: match.customer_details?.email || email,
          message: 'Purchase restored! All aboard Next Stop Europe.',
        });
      } else {
        res.json({
          unlocked: false,
          message: 'No paid Next Stop Europe ticket found for that email.',
        });
      }
    } catch (error) {
      console.error('Stripe restore error:', error);
      res.status(502).json({ unlocked: false, message: 'Could not reach Stripe.' });
    }
  });

  if (!IS_PROD) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`OBSCURA ARCADE server running at http://localhost:${PORT}`);
  });
}

createApp().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
