/* =========================================================
   THE FORMULATE  ·  Rosemary Hair Serum
   Vanilla JS  ·  no dependencies
   ========================================================= */
(function () {
  'use strict';

  /* ---------------------------------------------------------
     CONFIG
     ---------------------------------------------------------
     FORM_ENDPOINT : Formspree endpoint that receives the order.
     Replace the value below with the exact endpoint shown in your
     Formspree dashboard (it looks like https://formspree.io/f/xxxxxxxx)
     once the form is created for theformulate.co@gmail.com.
     If the endpoint ever fails, the form automatically falls back to a
     pre filled WhatsApp order so no lead is ever lost.
  --------------------------------------------------------- */
  var FORM_ENDPOINT = 'https://formspree.io/f/xppzlgpr';
  var WHATSAPP      = '+8801617226321';

  var $  = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var isDesktop    = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  /* ---------- Bangla numerals ---------- */
  var BN = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];

  function toBn(value) {
    return String(value).replace(/\d/g, function (d) { return BN[+d]; });
  }
  function toEn(value) {
    return String(value).replace(/[০-৯]/g, function (d) {
      return String(d.charCodeAt(0) - 0x09E6);
    });
  }
  function money(n) {
    return toBn(Number(n).toLocaleString('en-US')) + '৳';
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }

  /* =========================================================
     HEADER · SCROLL PROGRESS · FLOATING UI
     ========================================================= */
  var head        = $('#siteHead');
  var progress    = $('#scrollProgress');
  var stickyBar   = $('#stickyBar');
  var toTop       = $('#toTop');
  var heroSection = $('#hero');

  function onScroll() {
    var y = window.scrollY || window.pageYOffset;
    var max = document.documentElement.scrollHeight - window.innerHeight;

    if (head) head.classList.toggle('is-stuck', y > 24);
    if (progress) progress.style.width = (max > 0 ? (y / max) * 100 : 0) + '%';
    if (toTop) toTop.classList.toggle('is-on', y > 700);

    if (stickyBar && heroSection) {
      var passedHero = y > heroSection.offsetHeight * 0.75;
      var order = $('#order');
      var inOrder = false;
      if (order) {
        var r = order.getBoundingClientRect();
        inOrder = r.top < window.innerHeight * 0.9 && r.bottom > 0;
      }
      stickyBar.classList.toggle('is-on', passedHero && !inOrder);
    }
  }

  var ticking = false;
  window.addEventListener('scroll', function () {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(function () { onScroll(); ticking = false; });
  }, { passive: true });
  onScroll();

  if (toTop) {
    toTop.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
    });
  }

  /* =========================================================
     MOBILE NAV
     ========================================================= */
  var burger = $('#burger');
  var nav    = $('#nav');

  function closeNav() {
    if (!nav) return;
    nav.classList.remove('is-open');
    if (burger) {
      burger.classList.remove('is-open');
      burger.setAttribute('aria-expanded', 'false');
      burger.setAttribute('aria-label', 'মেনু খুলুন');
    }
  }

  if (burger && nav) {
    burger.addEventListener('click', function () {
      var open = nav.classList.toggle('is-open');
      burger.classList.toggle('is-open', open);
      burger.setAttribute('aria-expanded', open ? 'true' : 'false');
      burger.setAttribute('aria-label', open ? 'মেনু বন্ধ করুন' : 'মেনু খুলুন');
    });
  }
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeNav();
  });

  /* =========================================================
     SMOOTH SCROLL
     ========================================================= */
  function headOffset() {
    var h = head ? head.offsetHeight : 74;
    return h + 12;
  }

  function scrollToTarget(target) {
    var top = target.getBoundingClientRect().top + window.pageYOffset - headOffset();
    window.scrollTo({ top: Math.max(top, 0), behavior: reduceMotion ? 'auto' : 'smooth' });
  }

  $$('a[data-scroll]').forEach(function (link) {
    link.addEventListener('click', function (e) {
      var id = link.getAttribute('href');
      if (!id || id.charAt(0) !== '#') return;
      var target = document.querySelector(id);
      if (!target) return;
      e.preventDefault();
      closeNav();
      scrollToTarget(target);
      if (history.replaceState) history.replaceState(null, '', id);
    });
  });

  /* =========================================================
     REVEAL ON SCROLL
     ========================================================= */
  var revealables = $$('[data-reveal]');

  if ('IntersectionObserver' in window && !reduceMotion) {
    var revealObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        var delay = parseInt(el.getAttribute('data-delay') || '0', 10);
        el.style.transitionDelay = delay + 'ms';
        el.classList.add('in');
        revealObserver.unobserve(el);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });

    revealables.forEach(function (el) { revealObserver.observe(el); });
  } else {
    revealables.forEach(function (el) { el.classList.add('in'); });
  }

  /* =========================================================
     ACTIVE NAV LINK
     ========================================================= */
  var sections = $$('main section[id]');
  var navLinks = $$('.nav a[href^="#"]');

  if ('IntersectionObserver' in window && sections.length) {
    var navObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var id = '#' + entry.target.id;
        navLinks.forEach(function (a) {
          a.classList.toggle('is-active', a.getAttribute('href') === id);
        });
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    sections.forEach(function (s) { navObserver.observe(s); });
  }

  /* =========================================================
     COUNTERS
     ========================================================= */
  function animateCount(el) {
    var target   = parseFloat(el.getAttribute('data-count'));
    var decimals = parseInt(el.getAttribute('data-decimals') || '0', 10);
    var suffix   = el.getAttribute('data-suffix') || '';
    var dur      = 1600;
    var start    = null;

    function frame(ts) {
      if (start === null) start = ts;
      var p = Math.min((ts - start) / dur, 1);
      var eased = 1 - Math.pow(1 - p, 3);
      var val = target * eased;
      var text = decimals
        ? val.toFixed(decimals)
        : Math.round(val).toLocaleString('en-US');
      el.textContent = toBn(text) + suffix;
      if (p < 1) window.requestAnimationFrame(frame);
    }
    window.requestAnimationFrame(frame);
  }

  var counters = $$('[data-count]');
  if ('IntersectionObserver' in window && counters.length) {
    var countObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        animateCount(entry.target);
        countObserver.unobserve(entry.target);
      });
    }, { threshold: 0.5 });
    counters.forEach(function (c) { countObserver.observe(c); });
  } else {
    counters.forEach(function (c) {
      var d = parseInt(c.getAttribute('data-decimals') || '0', 10);
      var v = parseFloat(c.getAttribute('data-count'));
      c.textContent = toBn(d ? v.toFixed(d) : v.toLocaleString('en-US')) + (c.getAttribute('data-suffix') || '');
    });
  }

  /* =========================================================
     CURSOR AURA + CARD TILT (desktop only)
     ========================================================= */
  if (isDesktop && !reduceMotion) {
    var aura = $('#cursorAura');
    if (aura) {
      var ax = 0, ay = 0, cx = 0, cy = 0, auraOn = false;
      window.addEventListener('mousemove', function (e) {
        ax = e.clientX; ay = e.clientY;
        if (!auraOn) { auraOn = true; aura.style.opacity = '1'; cx = ax; cy = ay; }
      }, { passive: true });

      (function loop() {
        cx += (ax - cx) * 0.12;
        cy += (ay - cy) * 0.12;
        aura.style.transform = 'translate3d(' + (cx - 170) + 'px,' + (cy - 170) + 'px,0)';
        window.requestAnimationFrame(loop);
      })();
    }

    $$('[data-tilt]').forEach(function (card) {
      card.addEventListener('mousemove', function (e) {
        var r = card.getBoundingClientRect();
        var px = (e.clientX - r.left) / r.width - 0.5;
        var py = (e.clientY - r.top) / r.height - 0.5;
        card.style.transform =
          'perspective(900px) rotateX(' + (-py * 6).toFixed(2) + 'deg) rotateY(' +
          (px * 6).toFixed(2) + 'deg) translateY(-8px)';
      });
      card.addEventListener('mouseleave', function () { card.style.transform = ''; });
    });
  }

  /* =========================================================
     COUNTDOWN (resets every midnight)
     ========================================================= */
  var cdH = $('#cdH'), cdM = $('#cdM'), cdS = $('#cdS');

  function tickCountdown() {
    if (!cdH) return;
    var now = new Date();
    var end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    var diff = Math.max(0, Math.floor((end - now) / 1000));
    cdH.textContent = toBn(pad(Math.floor(diff / 3600)));
    cdM.textContent = toBn(pad(Math.floor((diff % 3600) / 60)));
    cdS.textContent = toBn(pad(diff % 60));
  }
  tickCountdown();
  setInterval(tickCountdown, 1000);

  /* =========================================================
     DISTRICTS (all 64 districts of Bangladesh)
     ========================================================= */
  var DISTRICTS = [
    'ঢাকা', 'গাজীপুর', 'নারায়ণগঞ্জ', 'নরসিংদী', 'মানিকগঞ্জ', 'মুন্সীগঞ্জ', 'টাঙ্গাইল', 'কিশোরগঞ্জ',
    'ফরিদপুর', 'গোপালগঞ্জ', 'মাদারীপুর', 'রাজবাড়ী', 'শরীয়তপুর',
    'ময়মনসিংহ', 'জামালপুর', 'নেত্রকোণা', 'শেরপুর',
    'চট্টগ্রাম', 'কক্সবাজার', 'কুমিল্লা', 'ব্রাহ্মণবাড়িয়া', 'চাঁদপুর', 'ফেনী', 'লক্ষ্মীপুর', 'নোয়াখালী',
    'বান্দরবান', 'খাগড়াছড়ি', 'রাঙ্গামাটি',
    'সিলেট', 'হবিগঞ্জ', 'মৌলভীবাজার', 'সুনামগঞ্জ',
    'খুলনা', 'বাগেরহাট', 'সাতক্ষীরা', 'যশোর', 'ঝিনাইদহ', 'মাগুরা', 'নড়াইল', 'কুষ্টিয়া', 'চুয়াডাঙ্গা', 'মেহেরপুর',
    'বরিশাল', 'ভোলা', 'পটুয়াখালী', 'পিরোজপুর', 'বরগুনা', 'ঝালকাঠি',
    'রাজশাহী', 'বগুড়া', 'পাবনা', 'সিরাজগঞ্জ', 'নাটোর', 'নওগাঁ', 'জয়পুরহাট', 'চাঁপাইনবাবগঞ্জ',
    'রংপুর', 'দিনাজপুর', 'গাইবান্ধা', 'কুড়িগ্রাম', 'লালমনিরহাট', 'নীলফামারী', 'পঞ্চগড়', 'ঠাকুরগাঁও'
  ];

  var districtSelect = $('#fDistrict');
  if (districtSelect) {
    var frag = document.createDocumentFragment();
    DISTRICTS.forEach(function (d) {
      var o = document.createElement('option');
      o.value = d;
      o.textContent = d;
      frag.appendChild(o);
    });
    districtSelect.appendChild(frag);
  }

  /* =========================================================
     PACKAGE SELECTION + ORDER SUMMARY
     ========================================================= */
  var packInputs = $$('input[name="pack_choice"]');
  var sPack  = $('#sPack');
  var sPrice = $('#sPrice');
  var sTotal = $('#sTotal');
  var fPack  = $('#fPack');
  var fTotal = $('#fTotal');

  function currentPack() {
    var checked = packInputs.filter(function (i) { return i.checked; })[0] || packInputs[0];
    if (!checked) return { qty: 1, price: 1249, label: '১ বোতল' };
    return {
      qty: parseInt(checked.getAttribute('data-qty'), 10),
      price: parseInt(checked.getAttribute('data-price'), 10),
      label: checked.getAttribute('data-label')
    };
  }

  function syncSummary() {
    var p = currentPack();
    if (sPack)  sPack.textContent  = toBn(p.qty) + ' বোতল';
    if (sPrice) sPrice.textContent = money(p.price);
    if (sTotal) sTotal.textContent = money(p.price);
    if (fPack)  fPack.value  = p.label;
    if (fTotal) fTotal.value = p.price + ' BDT (ডেলিভারি ফ্রি)';
  }

  packInputs.forEach(function (input) {
    input.addEventListener('change', function () {
      syncSummary();
      showToast(input.getAttribute('data-label') + ' সিলেক্ট করা হয়েছে');
    });
  });
  syncSummary();

  /* =========================================================
     TOAST
     ========================================================= */
  var toastEl = $('#toast');
  var toastTimer = null;

  function showToast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('is-on'); }, 3200);
  }

  /* =========================================================
     FORM VALIDATION + SUBMIT
     ========================================================= */
  var form       = $('#tfOrderForm');
  var submitBtn  = $('#submitBtn');
  var successBox = $('#orderSuccess');
  var successMsg = $('#successMsg');
  var newOrderBtn= $('#newOrderBtn');

  var RULES = {
    fName: function (v) {
      if (!v) return 'আপনার নাম লিখুন।';
      if (v.length < 3) return 'নামটি অন্তত ৩ অক্ষরের হতে হবে।';
      if (!/^[ঀ-৿A-Za-z.\s'-]+$/.test(v)) return 'নামে শুধু অক্ষর ব্যবহার করুন।';
      return '';
    },
    fPhone: function (v) {
      var n = toEn(v).replace(/[\s\-()]/g, '');
      if (!n) return 'মোবাইল নম্বর দিন।';
      n = n.replace(/^\+?880/, '0');
      if (!/^01[3-9]\d{8}$/.test(n)) return 'সঠিক ১১ ডিজিটের নম্বর দিন। যেমন: ০১৭XXXXXXXX';
      return '';
    },
    fDistrict: function (v) {
      if (!v) return 'আপনার জেলা নির্বাচন করুন।';
      return '';
    },
    fAddress: function (v) {
      if (!v) return 'ডেলিভারির সম্পূর্ণ ঠিকানা লিখুন।';
      if (v.length < 10) return 'ঠিকানাটি আরেকটু বিস্তারিত লিখুন (অন্তত ১০ অক্ষর)।';
      return '';
    }
  };

  function fieldOf(el) { return el.closest('.field'); }

  function validateField(el, showError) {
    var rule = RULES[el.id];
    if (!rule) return true;
    var msg = rule(el.value.trim());
    var wrap = fieldOf(el);
    var errEl = wrap ? wrap.querySelector('.err') : null;

    if (msg) {
      if (showError && wrap) {
        wrap.classList.add('has-error');
        wrap.classList.remove('is-valid');
        if (errEl) errEl.textContent = msg;
      }
      return false;
    }
    if (wrap) {
      wrap.classList.remove('has-error');
      wrap.classList.add('is-valid');
      if (errEl) errEl.textContent = '';
    }
    return true;
  }

  if (form) {
    /* FORM_ENDPOINT stays the single source of truth: it is mirrored onto the
       form action so the no JavaScript fallback posts to the same place. */
    form.setAttribute('action', FORM_ENDPOINT);

    var fields = ['fName', 'fPhone', 'fDistrict', 'fAddress']
      .map(function (id) { return $('#' + id); })
      .filter(Boolean);

    fields.forEach(function (el) {
      el.addEventListener('blur', function () { validateField(el, true); });
      el.addEventListener('input', function () {
        var wrap = fieldOf(el);
        if (wrap && wrap.classList.contains('has-error')) validateField(el, true);
      });
      if (el.tagName === 'SELECT') {
        el.addEventListener('change', function () { validateField(el, true); });
      }
    });

    /* Bangla digits typed into the phone field become English automatically */
    var phone = $('#fPhone');
    if (phone) {
      phone.addEventListener('input', function () {
        var clean = toEn(phone.value).replace(/[^\d+]/g, '');
        if (clean !== phone.value) phone.value = clean;
      });
    }

    function whatsappLink() {
      var p = currentPack();
      var text =
        'আসসালামু আলাইকুম, আমি Rosemary Hair Serum অর্ডার করতে চাই।\n\n' +
        'প্যাকেজ: ' + p.label + '\n' +
        'মূল্য: ' + p.price + ' টাকা (ডেলিভারি ফ্রি)\n' +
        'নাম: ' + ($('#fName') ? $('#fName').value.trim() : '') + '\n' +
        'মোবাইল: ' + ($('#fPhone') ? $('#fPhone').value.trim() : '') + '\n' +
        'জেলা: ' + ($('#fDistrict') ? $('#fDistrict').value : '') + '\n' +
        'ঠিকানা: ' + ($('#fAddress') ? $('#fAddress').value.trim() : '');
      return 'https://wa.me/' + WHATSAPP.replace(/[^\d]/g, '') + '?text=' + encodeURIComponent(text);
    }

    function showSuccess(viaWhatsApp) {
      if (!successBox) return;
      form.hidden = true;
      successBox.hidden = false;

      if (viaWhatsApp && successMsg) {
        successBox.querySelector('h3').textContent = 'আরেকটি ধাপ বাকি';
        successMsg.textContent =
          'এই মুহূর্তে আমাদের সার্ভারে অর্ডারটি পাঠানো যায়নি। নিচের বাটনে চাপ দিলে আপনার তথ্যসহ ' +
          'মেসেজটি হোয়াটসঅ্যাপে তৈরি হয়ে যাবে, শুধু Send চাপুন। আমরা সঙ্গে সঙ্গে অর্ডারটি নিয়ে নেব।';
      }

      var waBtn = successBox.querySelector('a[href*="wa.me"]');
      if (waBtn) {
        waBtn.href = whatsappLink();
        waBtn.textContent = viaWhatsApp ? 'হোয়াটসঅ্যাপে অর্ডার পাঠান' : 'হোয়াটসঅ্যাপে কথা বলুন';
      }
      scrollToTarget($('#orderForm') || successBox);
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();

      /* honeypot: silently drop bots */
      var hp = form.querySelector('input[name="_gotcha"]');
      if (hp && hp.value) return;

      var ok = true;
      var firstBad = null;
      fields.forEach(function (el) {
        var valid = validateField(el, true);
        if (!valid && !firstBad) firstBad = el;
        ok = ok && valid;
      });

      if (!ok) {
        showToast('ফর্মে কিছু তথ্য ঠিক করতে হবে');
        if (firstBad) {
          var wrap = fieldOf(firstBad);
          if (wrap) scrollToTarget(wrap);
          firstBad.focus({ preventScroll: true });
        }
        return;
      }

      syncSummary();

      var data = new FormData(form);
      data.append('অর্ডারের_সময়', new Date().toLocaleString('en-GB', { hour12: true }));
      data.append('পেজ', window.location.href);

      submitBtn.classList.add('is-loading');
      var label = submitBtn.querySelector('.btn__label');
      if (label) label.textContent = 'পাঠানো হচ্ছে';

      fetch(FORM_ENDPOINT, {
        method: 'POST',
        body: data,
        headers: { Accept: 'application/json' }
      })
        .then(function (res) {
          if (!res.ok) throw new Error('bad status ' + res.status);
          return res.json().catch(function () { return {}; });
        })
        .then(function () {
          showToast('অর্ডারটি সফলভাবে জমা হয়েছে');
          showSuccess(false);
        })
        .catch(function () {
          showToast('সার্ভারে সমস্যা, হোয়াটসঅ্যাপে পাঠিয়ে দিন');
          showSuccess(true);
        })
        .then(function () {
          submitBtn.classList.remove('is-loading');
          if (label) label.textContent = 'অর্ডার কনফার্ম করুন';
        });
    });

    if (newOrderBtn) {
      newOrderBtn.addEventListener('click', function () {
        form.reset();
        $$('.field', form).forEach(function (f) { f.classList.remove('has-error', 'is-valid'); });
        syncSummary();
        successBox.hidden = true;
        form.hidden = false;
        scrollToTarget($('#orderForm'));
      });
    }
  }

  /* =========================================================
     FAQ: only one open at a time
     ========================================================= */
  var faqs = $$('.faq');
  faqs.forEach(function (d) {
    d.addEventListener('toggle', function () {
      if (!d.open) return;
      faqs.forEach(function (other) { if (other !== d) other.open = false; });
    });
  });

  /* =========================================================
     MISC
     ========================================================= */
  var yearEl = $('#year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  /* Land on the right section when the page opens with a hash */
  window.addEventListener('load', function () {
    if (window.location.hash) {
      var t = document.querySelector(window.location.hash);
      if (t) setTimeout(function () { scrollToTarget(t); }, 120);
    }
  });
})();
