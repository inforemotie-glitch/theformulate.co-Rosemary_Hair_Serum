/* =========================================================
   THE FORMULATE  ·  Meta Conversions API - browser events
   Vercel Serverless Function  ·  POST /api/meta
   =========================================================
   Handles the events the browser fires directly:
   PageView, ViewContent, InitiateCheckout.

   Lead and Purchase are NOT sent through here - they are fired
   from /api/order the moment an order is genuinely accepted, so
   they can carry hashed customer data and a server-verified value.

   Env vars:
     META_PIXEL_ID         required
     META_CAPI_TOKEN       required
     META_TEST_EVENT_CODE  optional, testing only
   ========================================================= */

import {
  ALLOWED_EVENTS,
  buildEvent,
  clientContext,
  parseBody,
  sendToMeta
} from './_capi.js';

/* Conversion events are owned by /api/order, which can prove they happened. */
const BROWSER_EVENTS = new Set(['PageView', 'ViewContent', 'InitiateCheckout', 'Contact']);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!process.env.META_PIXEL_ID || !process.env.META_CAPI_TOKEN) {
    console.error('[meta-capi] Missing META_PIXEL_ID or META_CAPI_TOKEN');
    return res.status(500).json({ error: 'Server not configured' });
  }

  const body = parseBody(req);
  const { eventName, eventId, eventSourceUrl, fbp, fbc, customData } = body;

  if (!eventName || !eventId) {
    return res.status(400).json({ error: 'eventName and eventId are required' });
  }
  if (!ALLOWED_EVENTS.has(eventName) || !BROWSER_EVENTS.has(eventName)) {
    return res.status(400).json({ error: 'Unsupported eventName' });
  }

  const { ip, userAgent } = clientContext(req);

  const event = buildEvent({
    eventName,
    eventId,
    eventSourceUrl: (typeof eventSourceUrl === 'string' && eventSourceUrl) || req.headers.referer,
    ip,
    userAgent,
    fbp,
    fbc,
    customData
  });

  try {
    const result = await sendToMeta([event]);
    return res.status(200).json({
      success: true,
      eventId: String(eventId),
      events_received: result.events_received,
      fbtrace_id: result.fbtrace_id
    });
  } catch (err) {
    // Log detail server-side; never echo Meta's internals to the browser.
    console.error('[meta-capi]', err.message, err.details ? JSON.stringify(err.details) : '');
    return res.status(502).json({ error: 'Event could not be recorded' });
  }
}
