/* =========================================================
   THE FORMULATE  ·  Meta Conversions API (server-side)
   Vercel Serverless Function  ·  POST /api/meta
   =========================================================
   Receives { eventName, eventId, ... } from the browser and
   forwards it to Meta's Graph API. The browser Pixel sends the
   SAME eventId, so Meta deduplicates the pair into one event.

   Required env vars (Vercel dashboard):
     META_PIXEL_ID        e.g. 1234567890123456
     META_CAPI_TOKEN      Conversions API access token
   Optional:
     META_TEST_EVENT_CODE e.g. TEST12345  (only while testing)
   ========================================================= */

const GRAPH_VERSION = 'v20.0';

/* Only events this site actually sends. The endpoint is public,
   so this stops anyone from injecting junk into the pixel. */
const ALLOWED_EVENTS = new Set([
  'PageView',
  'ViewContent',
  'Lead',
  'Contact',
  'InitiateCheckout',
  'AddToCart',
  'Purchase'
]);

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

  /* ---------- 1. Parse the JSON body ----------
     Vercel parses application/json automatically, but a beacon or a
     stripped Content-Type can arrive as a raw string. Handle both. */
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  if (!body || typeof body !== 'object') body = {};

  const { eventName, eventId, eventSourceUrl, fbp, fbc, customData } = body;

  if (!eventName || !eventId) {
    return res.status(400).json({ error: 'eventName and eventId are required' });
  }
  if (!ALLOWED_EVENTS.has(eventName)) {
    return res.status(400).json({ error: 'Unsupported eventName' });
  }

  /* ---------- 2. Identify the visitor ----------
     x-forwarded-for is a comma-separated chain; the first entry is
     the real client. fbp / fbc come from the Pixel's own cookies and
     are what actually lift Meta's match quality above ~5.0. */
  const forwarded = req.headers['x-forwarded-for'];
  const forwardedStr = Array.isArray(forwarded) ? forwarded[0] : (forwarded || '');
  const clientIp =
    forwardedStr.split(',')[0].trim() ||
    req.headers['x-real-ip'] ||
    (req.socket && req.socket.remoteAddress) ||
    '';
  const userAgent = req.headers['user-agent'] || '';

  const user_data = {};
  if (clientIp)  user_data.client_ip_address = clientIp;
  if (userAgent) user_data.client_user_agent = userAgent;
  if (fbp && typeof fbp === 'string') user_data.fbp = fbp;
  if (fbc && typeof fbc === 'string') user_data.fbc = fbc;

  /* ---------- 3. Build the CAPI payload ---------- */
  const event = {
    event_name: eventName,
    event_time: Math.floor(Date.now() / 1000),
    event_id: String(eventId),            // <-- the dedupe key
    action_source: 'website',
    event_source_url:
      (typeof eventSourceUrl === 'string' && eventSourceUrl) ||
      req.headers.referer ||
      undefined,
    user_data
  };

  if (customData && typeof customData === 'object' && !Array.isArray(customData)) {
    event.custom_data = customData;
  }

  const payload = { data: [event] };
  if (TEST_CODE) payload.test_event_code = TEST_CODE;

  /* ---------- 4. Send it to Meta ---------- */
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
      // Log the detail server-side; don't echo Meta's internals to the browser.
      console.error('[meta-capi] Graph API error', fbRes.status, JSON.stringify(result));
      return res.status(502).json({ error: 'Meta rejected the event' });
    }

    return res.status(200).json({
      success: true,
      eventId: String(eventId),
      events_received: result.events_received,
      fbtrace_id: result.fbtrace_id
    });
  } catch (err) {
    console.error('[meta-capi] Request failed', err);
    return res.status(500).json({ error: 'Failed to send event' });
  }
}
