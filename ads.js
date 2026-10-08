(function () {
  'use strict';

  // AdSense 승인 전까지 외부 광고 요청을 보내지 않는 중립 레이어.
  // 승인 후 ADSENSE_CLIENT_ID에 ca-pub ID를 입력하면 표준 반응형 슬롯으로 렌더링된다.
  var ADSENSE_CLIENT_ID = '';
  var ADSENSE_LOADER_URL = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js';
  var EMPTY_CHECK_DELAY_MS = 4000;

  function readMeta(slot) {
    return {
      name: slot.getAttribute('data-gh-ad') || 'unnamed',
      width: parseInt(slot.getAttribute('data-width'), 10) || 300,
      height: parseInt(slot.getAttribute('data-height'), 10) || 250
    };
  }

  function collapseSlot(slot) {
    if (!slot || slot.getAttribute('data-ad-empty') === '1') return;
    slot.setAttribute('data-ad-empty', '1');
    var container = slot.closest('.ad-leaderboard, .ad-mobile, .panel, .ad-zone-band') || slot;
    container.style.display = 'none';
  }

  function loadAdSense(onReady) {
    if (document.getElementById('adsense-loader')) { onReady(); return; }
    var tag = document.createElement('script');
    tag.id = 'adsense-loader';
    tag.async = true;
    tag.src = ADSENSE_LOADER_URL + '?client=' + encodeURIComponent(ADSENSE_CLIENT_ID);
    tag.crossOrigin = 'anonymous';
    tag.onload = onReady;
    tag.onerror = onReady;
    document.head.appendChild(tag);
  }

  function mountSlot(slot) {
    if (!slot || slot.getAttribute('data-mount-attempted') === '1') return;
    slot.setAttribute('data-mount-attempted', '1');
    if (!ADSENSE_CLIENT_ID) {
      collapseSlot(slot);
      return;
    }
    readMeta(slot);
    loadAdSense(function () {
      var ins = document.createElement('ins');
      ins.className = 'adsbygoogle';
      ins.style.display = 'block';
      ins.setAttribute('data-ad-client', ADSENSE_CLIENT_ID);
      ins.setAttribute('data-ad-format', 'auto');
      ins.setAttribute('data-full-width-responsive', 'true');
      slot.appendChild(ins);
      try {
        (window.adsbygoogle = window.adsbygoogle || []).push({});
      } catch (e) {
        collapseSlot(slot);
        return;
      }
      window.setTimeout(function () {
        if (!slot.querySelector('.adsbygoogle iframe, .adsbygoogle img')) collapseSlot(slot);
      }, EMPTY_CHECK_DELAY_MS);
    });
  }

  var slotObserver = null;

  function observePendingSlots() {
    if (!slotObserver) return;
    document.querySelectorAll('[data-ads-config]').forEach(function (slot) {
      if (!slot.getAttribute('data-observed')) {
        slot.setAttribute('data-observed', '1');
        slotObserver.observe(slot);
      }
    });
  }

  window.GlobalHotAds = { rescan: observePendingSlots };

  function init() {
    if (!('IntersectionObserver' in window)) {
      document.querySelectorAll('[data-ads-config]').forEach(mountSlot);
      return;
    }
    slotObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          slotObserver.unobserve(entry.target);
          mountSlot(entry.target);
        }
      });
    }, { rootMargin: '160px 0px' });
    observePendingSlots();
  }

  init();
})();
