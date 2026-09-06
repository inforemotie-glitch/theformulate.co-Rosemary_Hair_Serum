/* =========================================================
   THE FORMULATE  ·  Order receiver
   Vercel Serverless Function  ·  POST /api/order
   =========================================================
   Replaces the browser's direct call to Formspree, which was
   failing (HTTP 400) and sending every customer to the WhatsApp
   fallback. Same-origin, so ad blockers cannot break it.

   Responsibilities:
     1. Validate the order server-side.
     2. Deliver it to at least one channel (Formspree / Telegram).
     3. Fire Lead + Purchase to the Conversions API, sharing the
        browser's event IDs so Meta deduplicates the pair.

   Delivery env vars - configure AT LEAST ONE:
     FORMSPREE_FORM_ID     8-char id, e.g. xrgnvqko
     TELEGRAM_BOT_TOKEN  + TELEGRAM_CHAT_ID
   ========================================================= */

import { buildEvent, clientContext, parseBody, sendToMeta, toEnglishDigits } from './_capi.js';

/* Server-side price table. The browser sends a quantity, never a price,
   so nobody can POST an inflated value into the Purchase events. */
const PRICES = {
  1: { price: 1249, label: '১ বোতল (৩০ দিনের স্টার্টার)' },
  2: { price: 2349, label: '২ বোতল (৬০ দিনের ফুল কোর্স)' },
  3: { price: 3299, label: '৩ বোতল (ফ্যামিলি প্যাক)' }
};

const CURRENCY   = 'BDT';
const CONTENT_ID = 'TF-RHS-50';

function orderRef() {
  const stamp = new Date().toISOString().slice(2, 10).replace(/-/g, '');
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return 'TF-' + stamp + '-' + rand;
}

function validPhoneBD(raw) {
  const digits = toEnglishDigits(raw).replace(/\D/g, '').replace(/^880/, '').replace(/^0/, '');
  return /^1[3-9]\d{8}$/.test(digits);
}

/* ---------- Delivery channels ---------- */

async function deliverFormspree(order) {
  const id = process.env.FORMSPREE_FORM_ID;
  if (!id) return null;

  const res = await fetch('https://formspree.io/f/' + id, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      _subject: 'নতুন অর্ডার ' + order.ref + ' · ' + order.pack.label,
      'অর্ডার_নম্বর': order.ref,
      'নাম': order.name,
      'মোবাইল': order.phone,
      'জেলা': order.district,
      'ঠিকানা': order.address,
      'প্যাকেজ': order.pack.label,
      'মোট_মূল্য': order.pack.price + ' ' + CURRENCY,
      'অর্ডারের_সময়': order.placedAt,
      'পেজ': order.pageUrl
    })
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error('Formspree ' + res.status + ' ' + detail.slice(0, 200));
  }
  return 'formspree';
}

async function deliverTelegram(order) {
  const token  = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return null;

  const text =
    '🛒 নতুন অর্ডার ' + order.ref + '\n\n' +
    '👤 ' + order.name + '\n' +
    '📱 ' + order.phone + '\n' +
    '📍 ' + order.district + '\n' +
    '🏠 ' + order.address + '\n\n' +
    '📦 ' + order.pack.label + '\n' +
    '💰 ' + order.pack.price + ' ' + CURRENCY + ' (ডেলিভারি ফ্রি)\n' +
    '🕒 ' + order.placedAt;

  const res = await fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text })
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error('Telegram ' + res.status + ' ' + detail.slice(0, 200));
  }
  return 'telegram';
}

/* ---------- Handler ---------- */

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = parseBody(req);

  /* Honeypot: pretend success so bots do not retry. */
  if (body._gotcha) {
    return res.status(200).json({ success: true, ref: orderRef() });
  }

  const name     = String(body.name     || '').trim();
  const phone    = String(body.phone    || '').trim();
  const district = String(body.district || '').trim();
  const address  = String(body.address  || '').trim();
  const qty      = parseInt(body.qty, 10);

  const errors = [];
  if (name.length < 2)      errors.push('name');
  if (!validPhoneBD(phone)) errors.push('phone');
  if (!district)            errors.push('district');
  if (address.length < 10)  errors.push('address');
  if (!PRICES[qty])         errors.push('qty');

  if (errors.length) {
    return res.status(400).json({ error: 'Invalid order', fields: errors });
  }

  const order = {
    ref: orderRef(),
    name: name,
    phone: phone,
    district: district,
    address: address,
    pack: { qty: qty, price: PRICES[qty].price, label: PRICES[qty].label },
    pageUrl: typeof body.pageUrl === 'string' ? body.pageUrl : (req.headers.referer || ''),
    placedAt: new Date().toLocaleString('en-GB', { timeZone: 'Asia/Dhaka', hour12: true })
  };

  /* ---------- 1. Deliver the order. This is what must not fail. ---------- */
  const attempts = await Promise.allSettled([
    deliverFormspree(order),
    deliverTelegram(order)
  ]);

  const delivered = attempts
    .filter((a) => a.status === 'fulfilled' && a.value)
    .map((a) => a.value);

  attempts
    .filter((a) => a.status === 'rejected')
    .forEach((a) => console.error('[order] delivery failed:', a.reason && a.reason.message));

  if (!delivered.length) {
    /* Nothing configured, or every channel errored. Log the full order so it is
       recoverable from Vercel logs, and let the client fall back to WhatsApp. */
    console.error('[order] NO DELIVERY CHANNEL SUCCEEDED. Order payload:', JSON.stringify(order));
    return res.status(502).json({ error: 'Order could not be delivered' });
  }

  /* ---------- 2. Conversions API: Lead + Purchase ----------
     Fired only now, because the order is provably accepted. Never allowed
     to fail the request - the customer's order is already safe. */
  const eventIds = (body.eventIds && typeof body.eventIds === 'object') ? body.eventIds : {};
  const context = clientContext(req);

  const shared = {
    eventSourceUrl: order.pageUrl,
    ip: context.ip,
    userAgent: context.userAgent,
    fbp: body.fbp,
    fbc: body.fbc,
    identity: { phone: order.phone, name: order.name, city: order.district }
  };

  const events = [];

  if (eventIds.lead) {
    events.push(buildEvent(Object.assign({}, shared, {
      eventName: 'Lead',
      eventId: eventIds.lead,
      customData: {
        currency: CURRENCY,
        value: order.pack.price,
        content_name: 'Rosemary Hair Serum',
        content_category: 'Hair Care'
      }
    })));
  }

  if (eventIds.purchase) {
    events.push(buildEvent(Object.assign({}, shared, {
      eventName: 'Purchase',
      eventId: eventIds.purchase,
      customData: {
        currency: CURRENCY,
        value: order.pack.price,
        content_name: 'Rosemary Hair Serum',
        content_type: 'product',
        content_ids: [CONTENT_ID],
        contents: [{
          id: CONTENT_ID,
          quantity: order.pack.qty,
          item_price: Math.round((order.pack.price / order.pack.qty) * 100) / 100
        }],
        num_items: order.pack.qty,
        order_id: order.ref
      }
    })));
  }

  if (events.length) {
    try {
      await sendToMeta(events);
    } catch (err) {
      console.error('[order] CAPI failed (order still accepted):', err.message,
        err.details ? JSON.stringify(err.details) : '');
    }
  }

  return res.status(200).json({
    success: true,
    ref: order.ref,
    delivered: delivered,
    value: order.pack.price,
    currency: CURRENCY
  });
}
