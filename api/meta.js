/* =========================================================
   THE FORMULATE  ·  Meta Conversions API
   Vercel Serverless Function  ·  POST /api/meta
   =========================================================
   Server half of the hybrid Pixel setup. The browser fires the
   Pixel with an eventID; this sends the same event with the same
   event_id, so Meta deduplicates the pair into one event.

   The order itself goes straight from the browser to Formspree.
   This endpoint is called only after Formspree answers ok:true,
   so a Lead or Purchase here always corresponds to a real
   submission.

   Customer data (phone, name, district) arrives raw over HTTPS
   from our own page and is SHA-256 hashed here before it is sent
   to Meta. It is never logged and never stored.

   Env vars (Vercel -> Settings -> Environment Variables):
     META_PIXEL_ID         required
     META_CAPI_TOKEN       required
     META_TEST_EVENT_CODE  optional, Test Events only
   ========================================================= */

import crypto from 'node:crypto';

const GRAPH_VERSION = 'v20.0';
const CURRENCY      = 'BDT';
const CONTENT_ID    = 'TF-RHS-50';
const CONTENT_NAME  = 'Rosemary Hair Serum';

const ALLOWED_EVENTS = new Set([
  'PageView',
  'ViewContent',
  'InitiateCheckout',
  'Lead',
  'Purchase',
  'Contact'
]);

/* Conversion values come from this table, never from the browser, so a
   crafted request cannot inflate reported revenue. Keep in sync with the
   data-price attributes on the pack radios in index.html. */
const PRICES = { 1: 1249, 2: 2349, 3: 3299 };

/* ---------- Normalisation + hashing ---------- */

const BN_DIGITS = '০১২৩৪৫৬৭৮৯';
const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';

/* Bengali (০-৯) and Arabic-Indic (٠-٩) numerals -> ASCII, so a phone
   number typed in Bengali still hashes to the same value as its English
   form and Meta can match the two. */
function toEnglishDigits(raw) {
  return String(raw || '').replace(/[০-৯٠-٩]/g, (d) => {
    const bn = BN_DIGITS.indexOf(d);
    if (bn > -1) return String(bn);
    const ar = AR_DIGITS.indexOf(d);
    return ar > -1 ? String(ar) : d;
  });
}

/* Meta requires SHA-256 of the trimmed, lowercased value. */
function sha256(value) {
  if (value === undefined || value === null) return undefined;
  const normalised = String(value).trim().toLowerCase();
  if (!normalised) return undefined;
  return crypto.createHash('sha256').update(normalised, 'utf8').digest('hex');
}

/* Bangladesh mobile -> E.164 digits without the "+", as Meta expects.
   01712345678 / +8801712345678 / ০১৭১২৩৪৫৬৭৮  ->  8801712345678 */
function normalisePhoneBD(raw) {
  const digits = toEnglishDigits(raw).replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('880') && digits.length >= 12) return digits;
  if (digits.startsWith('0')) return '880' + digits.slice(1);
  if (digits.length === 10 && digits.startsWith('1')) return '880' + digits;
  return digits;
}

/* ---------- Request helpers ---------- */

function parseBody(req) {
  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      body = Object.fromEntries(new URLSearchParams(body));
    }
  }
  return (body && typeof body === 'object') ? body : {};
}

function clientContext(req) {
  const forwarded = req.headers['x-forwarded-for'];
  const forwardedStr = Array.isArray(forwarded) ? forwarded[0] : (forwarded || '');
  const ip =
    forwardedStr.split(',')[0].trim() ||
    req.headers['x-real-ip'] ||
    (req.socket && req.socket.remoteAddress) ||
    '';
  return { ip, userAgent: req.headers['user-agent'] || '' };
}

/* ---------- Handler ---------- */

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const PIXEL_ID  = process.env.META_PIXEL_ID;
  const TOKEN     = process.env.META_CAPI_TOKEN;
  const TEST_CODE = process.env.META_TEST_EVENT_CODE;

  if (!PIXEL_ID || !TOKEN) {
    console.error('[meta-capi] Missing META_PIXEL_ID or META_CAPI_TOKEN');
    return res.status(500).json({ error: 'Server not configured' });
  }

  const body = parseBody(req);
  const { eventName, eventId, eventSourceUrl, fbp, fbc, user, orderId } = body;

  if (!eventName || !eventId) {
    return res.status(400).json({ error: 'eventName and eventId are required' });
  }
  if (!ALLOWED_EVENTS.has(eventName)) {
    return res.status(400).json({ error: 'Unsupported eventName' });
  }

  const { ip, userAgent } = clientContext(req);

  /* ---------- user_data ---------- */
  const user_data = {};
  if (ip)        user_data.client_ip_address = ip;
  if (userAgent) user_data.client_user_agent = userAgent;
  if (typeof fbp === 'string' && fbp) user_data.fbp = fbp;
  if (typeof fbc === 'string' && fbc) user_data.fbc = fbc;

  /* Advanced matching. Present only on conversion events, where the
     customer has actually given us their details. */
  if (user && typeof user === 'object') {
    const phone = normalisePhoneBD(user.phone);
    const ph = phone ? sha256(phone) : undefined;
    const fn = user.name ? sha256(user.name) : undefined;
    const ct = user.district ? sha256(String(user.district).replace(/\s+/g, '')) : undefined;
    const em = user.email ? sha256(user.email) : undefined;

    if (ph) user_data.ph = [ph];
    if (fn) user_data.fn = [fn];
    if (ct) user_data.ct = [ct];
    if (em) user_data.em = [em];
    if (ph || fn || ct || em) user_data.country = [sha256('bd')];
  }

  /* ---------- custom_data ---------- */
  const qty = parseInt(body.qty, 10);
  const isConversion = eventName === 'Purchase' || eventName === 'Lead';
  let custom_data;

  if (isConversion) {
    if (!PRICES[qty]) {
      return res.status(400).json({ error: 'A valid qty (1-3) is required for conversion events' });
    }
    const value = PRICES[qty];                 // server-side, authoritative
    custom_data = {
      currency: CURRENCY,
      value,
      content_name: CONTENT_NAME,
      content_type: 'product',
      content_ids: [CONTENT_ID],
      contents: [{
        id: CONTENT_ID,
        quantity: qty,
        item_price: Math.round((value / qty) * 100) / 100
      }],
      num_items: qty
    };
    if (eventName === 'Purchase' && orderId) custom_data.order_id = String(orderId);
  } else {
    custom_data = {
      currency: CURRENCY,
      content_name: CONTENT_NAME,
      content_type: 'product',
      content_ids: [CONTENT_ID],
      value: PRICES[qty] || PRICES[1]
    };
  }

  /* ---------- Send ---------- */
  const event = {
    event_name: eventName,
    event_time: Math.floor(Date.now() / 1000),
    event_id: String(eventId),        // <-- shared with the browser Pixel
    action_source: 'website',
    user_data,
    custom_data
  };

  const sourceUrl = (typeof eventSourceUrl === 'string' && eventSourceUrl) || req.headers.referer;
  if (sourceUrl) event.event_source_url = sourceUrl;

  const payload = { data: [event] };
  if (TEST_CODE) payload.test_event_code = TEST_CODE;

  try {
    const fbRes = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${PIXEL_ID}/events`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${TOKEN}`
        },
        body: JSON.stringify(payload)
      }
    );

    const result = await fbRes.json().catch(() => ({}));

    if (!fbRes.ok) {
      // Log detail server-side; never echo Meta's internals to the browser.
      console.error('[meta-capi]', eventName, fbRes.status, JSON.stringify(result));
      return res.status(502).json({ error: 'Event could not be recorded' });
    }

    return res.status(200).json({
      success: true,
      eventName,
      eventId: String(eventId),
      events_received: result.events_received,
      fbtrace_id: result.fbtrace_id
    });
  } catch (err) {
    console.error('[meta-capi] request failed:', err.message);
    return res.status(500).json({ error: 'Failed to send event' });
  }
}
