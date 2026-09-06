/* =========================================================
   Shared Meta Conversions API helper
   ---------------------------------------------------------
   Files in api/ prefixed with "_" are not routed as endpoints
   by Vercel, so this stays a private module.
   ========================================================= */

import crypto from 'node:crypto';

export const GRAPH_VERSION = 'v20.0';

export const ALLOWED_EVENTS = new Set([
  'PageView',
  'ViewContent',
  'Lead',
  'Contact',
  'InitiateCheckout',
  'AddToCart',
  'Purchase'
]);

/* ---------- Meta requires SHA-256 of normalised, lowercased values ---------- */
export function sha256(value) {
  if (value === undefined || value === null) return undefined;
  const normalised = String(value).trim().toLowerCase();
  if (!normalised) return undefined;
  return crypto.createHash('sha256').update(normalised, 'utf8').digest('hex');
}

/* Bengali (০-৯) and Arabic-Indic (٠-٩) numerals -> ASCII, so a phone
   number typed or pasted in Bengali is never silently dropped. */
const BN_DIGITS = '০১২৩৪৫৬৭৮৯';
const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';

export function toEnglishDigits(raw) {
  return String(raw || '').replace(/[০-৯٠-٩]/g, (d) => {
    const bn = BN_DIGITS.indexOf(d);
    if (bn > -1) return String(bn);
    const ar = AR_DIGITS.indexOf(d);
    return ar > -1 ? String(ar) : d;
  });
}

/* Bangladesh mobile numbers -> E.164 digits, no "+", as Meta expects.
   01712345678 / +8801712345678 / ০১৭১২৩৪৫৬৭৮  ->  8801712345678 */
export function normalisePhoneBD(raw) {
  const digits = toEnglishDigits(raw).replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('880') && digits.length >= 12) return digits;
  if (digits.startsWith('0')) return '880' + digits.slice(1);
  if (digits.length === 10 && digits.startsWith('1')) return '880' + digits;
  return digits;
}

/* ---------- Pull IP + UA off the request ---------- */
export function clientContext(req) {
  const forwarded = req.headers['x-forwarded-for'];
  const forwardedStr = Array.isArray(forwarded) ? forwarded[0] : (forwarded || '');
  const ip =
    forwardedStr.split(',')[0].trim() ||
    req.headers['x-real-ip'] ||
    (req.socket && req.socket.remoteAddress) ||
    '';
  return { ip, userAgent: req.headers['user-agent'] || '' };
}

/* ---------- Build one CAPI event ---------- */
export function buildEvent({
  eventName,
  eventId,
  eventSourceUrl,
  ip,
  userAgent,
  fbp,
  fbc,
  customData,
  identity          // { phone, name, city, email }
}) {
  const user_data = {};
  if (ip)        user_data.client_ip_address = ip;
  if (userAgent) user_data.client_user_agent = userAgent;
  if (typeof fbp === 'string' && fbp) user_data.fbp = fbp;
  if (typeof fbc === 'string' && fbc) user_data.fbc = fbc;

  /* Advanced matching. Raw PII is hashed here and never leaves in the clear. */
  if (identity) {
    const phone = normalisePhoneBD(identity.phone);
    if (phone)          user_data.ph = [sha256(phone)];
    if (identity.name)  user_data.fn = [sha256(identity.name)];
    if (identity.city)  user_data.ct = [sha256(String(identity.city).replace(/\s+/g, ''))];
    if (identity.email) user_data.em = [sha256(identity.email)];
    user_data.country = [sha256('bd')];
  }

  const event = {
    event_name: eventName,
    event_time: Math.floor(Date.now() / 1000),
    event_id: String(eventId),        // <-- the dedupe key, shared with the browser Pixel
    action_source: 'website',
    user_data
  };
  if (eventSourceUrl) event.event_source_url = eventSourceUrl;
  if (customData && typeof customData === 'object' && !Array.isArray(customData)) {
    event.custom_data = customData;
  }
  return event;
}

/* ---------- Ship events to Meta ---------- */
export async function sendToMeta(events) {
  const PIXEL_ID  = process.env.META_PIXEL_ID;
  const TOKEN     = process.env.META_CAPI_TOKEN;
  const TEST_CODE = process.env.META_TEST_EVENT_CODE;

  if (!PIXEL_ID || !TOKEN) {
    throw new Error('Missing META_PIXEL_ID or META_CAPI_TOKEN');
  }

  const payload = { data: events };
  if (TEST_CODE) payload.test_event_code = TEST_CODE;

  const res = await fetch(
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

  const result = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error('Graph API rejected the event');
    err.status = res.status;
    err.details = result;
    throw err;
  }
  return result;
}

/* ---------- Body parsing (JSON or form-encoded) ---------- */
export function parseBody(req) {
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
