(function () {
  'use strict';

  var measurementId = 'G-C8MS3D3NTV';
  var consentStorageKey = 'gh-consent-v1';
  var rawPath = window.location.pathname || '/';
  var path = rawPath.replace(/\/+$/, '') || '/';
  var route = path.replace(/\.html$/, '');
  var pageType = document.currentScript && document.currentScript.getAttribute('data-page-type');
  var analyticsLoaded = false;
  var analyticsLoadScheduled = false;
  var analyticsAllowed = false;

  function classifyContentGroup() {
    if (pageType === 'not_found') return 'not_found';
    if (route === '/' || route === '/index') return 'home';
    if (route === '/quiz' || route === '/quiz/index') return 'quiz';
    if (route === '/posts' || route === '/posts/index' || /^\/posts\/\d{4}-\d{2}-\d{2}$/.test(route)) {
      return 'daily_briefing';
    }
    if (/^\/analysis-[a-z0-9-]+$/.test(route)) return 'analysis';
    if (
      /^\/[a-z0-9-]+-guide$/.test(route) ||
      route === '/guide' ||
      route === '/market-indicators' ||
      route === '/fed-rate' ||
      route === '/forex' ||
      route === '/recession' ||
      route === '/portfolio'
    ) return 'evergreen_guide';
    if (
      route === '/about' ||
      route === '/sources' ||
      route === '/privacy' ||
      route === '/terms'
    ) return 'trust_policy';
    return 'other';
  }

  function readChoice() {
    try {
      var choice = window.localStorage.getItem(consentStorageKey);
      return choice === 'accepted' || choice === 'rejected' ? choice : null;
    } catch (error) {
      return null;
    }
  }

  function writeChoice(choice) {
    try {
      window.localStorage.setItem(consentStorageKey, choice);
      window.localStorage.removeItem('cookie-ok');
    } catch (error) {
      // The choice still applies to the current page when storage is unavailable.
    }
  }

  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function () {
    if (arguments[0] === 'event' && !analyticsAllowed) return;
    window.dataLayer.push(arguments);
  };

  window.gtag('consent', 'default', {
    analytics_storage: 'denied',
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    wait_for_update: 500
  });
  window.gtag('set', 'ads_data_redaction', true);
  window.gtag('set', 'url_passthrough', false);

  window.adsbygoogle = window.adsbygoogle || [];
  window.adsbygoogle.pauseAdRequests = 1;

  function clearAnalyticsCookies() {
    try {
      document.cookie.split(';').forEach(function (cookie) {
        var name = cookie.split('=')[0].trim();
        if (name === '_ga' || name.indexOf('_ga_') === 0) {
          document.cookie = name + '=; Max-Age=0; path=/; SameSite=Lax';
          document.cookie = name + '=; Max-Age=0; path=/; domain=.' + window.location.hostname + '; SameSite=Lax';
        }
      });
    } catch (error) {
      // Cookie cleanup is best-effort; Consent Mode remains denied.
    }
  }

  function loadAnalytics() {
    analyticsLoadScheduled = false;
    if (!analyticsAllowed || analyticsLoaded) return;
    analyticsLoaded = true;

    var contentGroup = classifyContentGroup();
    var safeLocation = (window.location.origin || 'https://globalhot.net') + rawPath;

    window.gtag('js', new Date());
    window.gtag('config', measurementId, {
      anonymize_ip: true,
      content_group: contentGroup,
      page_location: safeLocation,
      page_path: rawPath,
      page_title: document.title
    });

    var tag = document.createElement('script');
    tag.async = true;
    tag.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(measurementId);
    document.head.appendChild(tag);
  }

  function scheduleAnalyticsLoad() {
    if (analyticsLoaded || analyticsLoadScheduled) return;
    if (document.readyState === 'loading') {
      analyticsLoadScheduled = true;
      document.addEventListener('DOMContentLoaded', loadAnalytics, { once: true });
    } else {
      loadAnalytics();
    }
  }

  function applyChoice(choice) {
    analyticsAllowed = choice === 'accepted';
    var value = analyticsAllowed ? 'granted' : 'denied';

    window['ga-disable-' + measurementId] = !analyticsAllowed;

    window.gtag('consent', 'update', {
      analytics_storage: value
    });

    if (analyticsAllowed) {
      scheduleAnalyticsLoad();
    } else {
      clearAnalyticsCookies();
      if (analyticsLoaded && window.location && typeof window.location.reload === 'function') {
        window.location.reload();
      }
    }
  }

  function closeBanner() {
    var banner = document.getElementById('ghConsentBanner');
    var settings = document.getElementById('ghConsentSettings');
    if (banner) banner.hidden = true;
    if (settings) settings.hidden = false;
  }

  function saveChoice(choice) {
    if (choice !== 'accepted' && choice !== 'rejected') return;
    writeChoice(choice);
    applyChoice(choice);
    closeBanner();
  }

  function openSettings() {
    var banner = document.getElementById('ghConsentBanner');
    var settings = document.getElementById('ghConsentSettings');
    if (banner) {
      banner.hidden = false;
      banner.querySelector('[data-consent-accept]').focus();
    }
    if (settings) settings.hidden = true;
  }

  window.globalhotConsent = {
    getChoice: readChoice,
    hasAnalyticsConsent: function () { return analyticsAllowed; },
    setChoice: saveChoice,
    openSettings: openSettings
  };

  function renderConsentControls() {
    if (document.getElementById('ghConsentBanner')) return;

    var style = document.createElement('style');
    style.textContent = [
      '.gh-consent-banner{position:fixed;z-index:2147483646;left:16px;right:16px;bottom:16px;max-width:760px;margin:auto;padding:18px 20px;background:#fff;color:#1f2937;border:1px solid #d6d3d1;border-radius:10px;box-shadow:0 12px 36px rgba(0,0,0,.18);font:14px/1.6 Arial,\"Noto Sans KR\",sans-serif}',
      '.gh-consent-banner[hidden],.gh-consent-settings[hidden]{display:none!important}',
      '.gh-consent-banner p{margin:0}.gh-consent-banner a{color:#b42318;text-decoration:underline}',
      '.gh-consent-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}',
      '.gh-consent-actions button,.gh-consent-settings{min-height:44px;border:1px solid #a8a29e;border-radius:6px;padding:8px 16px;background:#fff;color:#292524;font-weight:700;cursor:pointer}',
      '.gh-consent-actions button[data-consent-accept]{border-color:#c7372f;background:#c7372f;color:#fff}',
      '.gh-consent-actions button:focus-visible,.gh-consent-settings:focus-visible{outline:3px solid #2563eb;outline-offset:2px}',
      '.gh-consent-settings{position:fixed;z-index:2147483645;left:12px;bottom:12px;min-height:36px;padding:6px 10px;background:#fff;font-size:12px;box-shadow:0 4px 16px rgba(0,0,0,.14)}',
      '@media(max-width:520px){.gh-consent-banner{left:10px;right:10px;bottom:10px;padding:16px}.gh-consent-actions{display:grid;grid-template-columns:1fr 1fr}.gh-consent-actions button{width:100%}}',
      '@media print{.gh-consent-banner,.gh-consent-settings{display:none!important}}'
    ].join('');
    document.head.appendChild(style);

    var banner = document.createElement('aside');
    banner.id = 'ghConsentBanner';
    banner.className = 'gh-consent-banner';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-labelledby', 'ghConsentTitle');
    banner.innerHTML = '<p id="ghConsentTitle"><strong>쿠키 선택</strong></p>' +
      '<p>동의하면 방문 통계를 위해 Google Analytics 쿠키를 사용합니다. 거부해도 사이트를 이용할 수 있습니다. <a href="/privacy.html">자세히 보기</a></p>' +
      '<div class="gh-consent-actions"><button type="button" data-consent-reject>거부</button><button type="button" data-consent-accept>동의</button></div>';

    var settings = document.createElement('button');
    settings.id = 'ghConsentSettings';
    settings.className = 'gh-consent-settings';
    settings.type = 'button';
    settings.textContent = '쿠키 설정';
    settings.hidden = true;

    banner.querySelector('[data-consent-accept]').addEventListener('click', function () {
      saveChoice('accepted');
    });
    banner.querySelector('[data-consent-reject]').addEventListener('click', function () {
      saveChoice('rejected');
    });
    settings.addEventListener('click', openSettings);

    document.body.appendChild(banner);
    document.body.appendChild(settings);

    if (readChoice()) closeBanner();
    else banner.querySelector('[data-consent-reject]').focus();
  }

  var initialChoice = readChoice();
  if (initialChoice) applyChoice(initialChoice);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderConsentControls, { once: true });
  } else {
    renderConsentControls();
  }
})();
