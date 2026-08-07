(function () {
  'use strict';

  // GlobalHot 광고 레이어 (Ad Layer)
  // ---------------------------------------------------------------
  // 설계 원칙 (정적 HTML + Cloudflare Pages 한계 안에서):
  //   1. 광고 네트워크 스크립트는 HTML에 하드코딩하지 않고 런타임에만 주입한다
  //      (홈페이지 정적 마크업 테스트는 <script src="https://...">를 금지).
  //   2. 뷰포트 근접 시에만 로더를 내려 받는다 (IntersectionObserver 지연 로드).
  //   3. 광고 차단/네트워크 실패가 감지되면 화면을 깨지 않도록 후원 CTA로 대체한다.
  //   4. 각 광고 슬롯은 <aside class="ad-slot" data-ad-zone> 형식으로 마운트한다.
  //   실제 광고 네트워크와 의존 관계 없이 페이지 구조가 먼저 증명되도록
  //   "데모 머신" 모드일 때는 슬롯이 로컬 목업 광고 레이블로 채워진다.

  var JUICY_ZONE_ID = 1123909;
  var JUICY_LOADER_URL = 'https://poweredby.jads.co/js/jads.js';
  var FALLBACK_DELAY_MS = 4000;

  // 광고 차단 감지: 네트워크 로더가 FALLBACK_DELAY_MS 안에 준비되지 못하면
  // 슬롯을 후원 CTA로 바꿔 광고 대신 사이트 지지 기회를 보여준다.
  function mountFallback(slot, meta) {
    if (!slot || slot.getAttribute('data-fallback-mounted') === '1') return;
    slot.setAttribute('data-fallback-mounted', '1');
    slot.classList.add('has-fallback');

    var fallback = document.createElement('div');
    fallback.className = 'ad-fallback';
    var heading = document.createElement('span');
    heading.className = 'ad-fallback-label';
    heading.textContent = '광고 대신 후원으로 GlobalHot을 지지해 주세요';
    var support = document.createElement('a');
    support.className = 'support-cta';
    support.href = 'https://patreon.com/globalhot';
    support.target = '_blank';
    support.rel = 'noopener noreferrer';
    support.setAttribute('aria-label', 'Patreon으로 GlobalHot 후원 (새 창)');
    support.textContent = 'Become a Patron';
    fallback.appendChild(heading);
    fallback.appendChild(support);
    slot.appendChild(fallback);
  }

  function scheduleFallback(slot, meta) {
    if (typeof window === 'undefined') return;
    window.setTimeout(function () {
      var loaded = window.adsbyjuicy && window.adsbyjuicy.ready === true;
      mountFallback(slot, meta);
    }, FALLBACK_DELAY_MS);
  }

  function loadJuicy() {
    var loader = document.getElementById('juicyads-loader');
    if (loader || window.adsbyjuicy !== undefined) {
      markReady();
      return;
    }
    loader = document.createElement('script');
    loader.id = 'juicyads-loader';
    loader.type = 'text/javascript';
    loader.setAttribute('data-cfasync', 'false');
    loader.async = true;
    loader.src = JUICY_LOADER_URL;
    var head = document.head || document.body;
    if (head) head.appendChild(loader);
    markReady();
  }

  function mountJuicySlot(slot, meta) {
    if (!slot || slot.getAttribute('data-juicy-mounted') === '1') return;
    slot.setAttribute('data-juicy-mounted', '1');

    var ins = document.createElement('ins');
    ins.setAttribute('id', String(meta.zone));
    ins.setAttribute('data-width', String(meta.width));
    ins.setAttribute('data-height', String(meta.height));
    slot.appendChild(ins);

    window.adsbyjuicy = window.adsbyjuicy || [];
    window.adsbyjuicy.push({ adzone: meta.zone });
  }

  function activatedSlot(slot) {
    if (!slot) return;
    var meta = {
      zone: slot.getAttribute('data-zone') || JUICY_ZONE_ID,
      width: Number(slot.getAttribute('data-width')) || 300,
      height: Number(slot.getAttribute('data-height')) || 250,
    };
    loadJuicy();
    mountJuicySlot(slot, meta);
    scheduleFallback(slot, meta);
  }

  function observe(meta) {
    var containers = typeof document !== 'undefined' && document.querySelectorAll
      ? Array.prototype.slice.call(document.querySelectorAll(meta.selector))
      : [];
    if (!containers.length) return;
    if (!window.IntersectionObserver) {
      containers.forEach(activatedSlot);
      return;
    }
    var observer = new window.IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          activatedSlot(entry.target);
          observer.unobserve(entry.target);
        }
      });
    }, { rootMargin: '220px 0px' });
    containers.forEach(function (slot) { observer.observe(slot); });
  }

  function init() {
    if (typeof document === 'undefined' || typeof window === 'undefined') return;

    // data-ads-config="slots" 스코프 안의 요소를 관찰한다. 페이지에는 슬롯만
    // 두고, 네트워크 로더는 첫 슬롯이 뷰포트에 들어올 때만 실행된다.
    document.querySelectorAll('[data-ads-config]').forEach(function (container) {
      var selector = container.getAttribute('data-ads-config') || '.ad-spot';
      observe({ selector: selector });
    });

    var rootFallback = document.querySelectorAll('[data-ads-config]').length;
    if (rootFallback === 0) {
      observe({ selector: '.ad-spot,.ad-slot' });
    }
  }

  if (typeof window !== 'undefined') {
    window.globalhotAds = {
      active: true,
      zoneId: JUICY_ZONE_ID,
      mountFallback: mountFallback,
    };
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
      init();
    }
  }
}());