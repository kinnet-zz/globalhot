(function () {
  'use strict';

  // GlobalHot 광고 레이어 (Ad Layer)
  // ---------------------------------------------------------------
  // 설계 원칙 (정적 HTML + Cloudflare Pages 한계 안에서):
  //   1. 광고 네트워크 스크립트는 HTML에 하드코딩하지 않고 런타임에만 주입한다
  //      (홈페이지 정적 마크업 테스트는 <script src="https://...">를 금지).
  //   2. 뷰포트 근접 시에만 로더를 내려 받는다 (IntersectionObserver 지연 로드).
  //   3. 광고 차단/네트워크 실패가 감지되면 화면을 깨지 않도록 중립 폴백으로 대체한다.
  //   4. 각 광고 슬롯은 <aside class="ad-slot" data-ad-zone> 형식으로 마운트한다.
  //   존 ID는 페이지 마크업의 data-ad-zone 속성이 우선하며, 없으면 기본값을 쓴다.

  var DEFAULT_ZONE_ID = 1123909;
  var INTERSTITIAL_ZONE_ID = 1124196;
  var JUICY_LOADER_URL = 'https://poweredby.jads.co/js/jads.js';
  var FALLBACK_DELAY_MS = 4000;
  var juicy = null;

  // JuicyAds 로더 준비 상태를 추적한다. 스크립트 로드 완료(또는 이미 로드됨) 시
  // true가 되어 폴백이 빈 슬롯을 덮지 않는다.
  var loaderReady = 'idle'; // idle | loading | ready | failed

  function ensureJuicy() {
    if (juicy) return juicy;
    juicy = window.adsbyjuicy || [];
    window.adsbyjuicy = juicy;
    return juicy;
  }

  function readMeta(slot) {
    var zone = parseInt(slot.getAttribute('data-ad-zone'), 10) || DEFAULT_ZONE_ID;
    var width = parseInt(slot.getAttribute('data-width'), 10) || 300;
    var height = parseInt(slot.getAttribute('data-height'), 10) || 250;
    return { zone: zone, width: width, height: height };
  }

  // 광고 차단이 감지된 슬롯을 깨진 박스 대신 중립 안내로 대체한다.
  function mountFallback(slot, meta) {
    if (!slot || slot.getAttribute('data-fallback-mounted') === '1') return;
    slot.setAttribute('data-fallback-mounted', '1');
    slot.classList.add('has-fallback');
    var fallback = document.createElement('div');
    fallback.className = 'ad-fallback';
    var heading = document.createElement('span');
    heading.className = 'ad-fallback-label';
    heading.textContent = 'Sponsored';
    var note = document.createElement('p');
    note.textContent = '광고를 불러오는 중입니다. 광고 차단 기능을 끄면 이 영역이 표시됩니다.';
    fallback.appendChild(heading);
    fallback.appendChild(note);
    slot.appendChild(fallback);
  }

  // JuicyAds 스크립트를 한 번만 주입한다.
  function loadJuicy() {
    if (loaderState() !== 'idle') return;
    loaderState('loading');
    var loader = document.createElement('script');
    loader.id = 'juicyads-loader';
    loader.src = JUICY_LOADER_URL;
    loader.async = true;
    loader.onload = function () { loaderState('ready'); enqueueFlush(); };
    loader.onerror = function () { loaderState('error'); window.jadsLoadFailed = true; };
    (document.head || document.getElementsByTagName('head')[0]).appendChild(loader);
  }

  function loaderState(next) {
    if (typeof next === 'string') { loaderReady = next; return next; }
    return loaderReady;
  }

  function enqueueFlush() {
    window.setTimeout(function () {
      var juicy = ensureJuicy();
      if (typeof juicy.flush === 'function') juicy.flush();
    }, 600);
  }

  function mountJuicySlot(slot, meta) {
    var juicy = ensureJuicy();
    var ins = document.createElement('ins');
    ins.className = 'adsbyjuicy';
    ins.setAttribute('data-ad-zone', String(meta.zone));
    ins.setAttribute('data-width', String(meta.width));
    ins.setAttribute('data-height', String(meta.height));
    slot.appendChild(ins);
    juicy.push({ adzone: meta.zone });
    return ins;
  }

  function scheduleFallback(slot) {
    window.setTimeout(function () {
      if (loaderState() === 'ready') return;
      if (slot.querySelector('.adsbyjuicy iframe, .adsbyjuicy img, .adsbyjuicy > div')) return;
      mountFallback(slot, {});
    }, FALLBACK_DELAY_MS);
  }

  function createSlotObserver() {
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting && !entry.target.getAttribute('data-mount-attempted')) {
          entry.target.setAttribute('data-mount-attempted', '1');
          var slot = entry.target;
          var meta = readMeta(slot);
          loadJuicy();
          var ins = mountJuicySlot(slot, meta);
          if (ins) scheduleFallback(slot, meta);
        }
      });
    }, { rootMargin: '160px 0px' });
    document.querySelectorAll('[data-ads-config].ad-slot').forEach(function (slot) {
      observer.observe(slot);
    });
    return observer;
  }

  // 인터스티셥 존: 세션당 한 번만, 콘텐츠가 준비된 뒤 짧은 지연을 두고 요청한다.
  // 만 오픈 때마다 떠서 화면을 가리는 사고를 막기 위해 localStorage로 쿨다운한다.
  function scheduleInterstitial() {
    if (!INTERSTITIAL_ZONE_ID) return;
    var key = 'globalhot-interstitial-shown';
    var tryStored = function () {
      try { return window.localStorage.getItem(key) === '1'; }
      catch (e) { return false; }
    };
    var markStored = function () {
      try { window.localStorage.setItem(key, '1'); } catch (e) { /* private mode */ }
    };
    if (tryStored()) return;
    window.setTimeout(function () {
      ensureJuicy().push({ adzone: INTERSTITIAL_ZONE_ID });
      markStored();
    }, 2000);
  }

  function init() {
    if (!('IntersectionObserver' in window)) return;
    window.addEventListener('load', scheduleInterstitial);
    createSlotObserver();
  }

  init();
})();