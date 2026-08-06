(function () {
  'use strict';

  var LOCAL_STORAGE_KEY = 'globalhot-local-recommendations-v1';
  var SERVER_STORAGE_KEY = 'globalhot-recommendations-v2';
  var VALID_CATEGORIES = ['all', 'model', 'cosplay', 'gravure'];
  var VALID_COUNTRIES = ['all', 'JAPAN', 'KOREA', 'WORLD'];
  var VALID_SORTS = ['popular', 'latest', 'name'];

  function isSafeCount(value) {
    return typeof value === 'number' && isFinite(value) && Math.floor(value) === value && value >= 0 && value <= Number.MAX_SAFE_INTEGER;
  }

  function getStoredRecommendations(storageKey, allowedIds) {
    try {
      var stored = window.localStorage.getItem(storageKey);
      if (!stored) return {};
      var parsed = JSON.parse(stored);
      if (!Array.isArray(parsed)) return {};
      return parsed.reduce(function (recommendations, id) {
        if (typeof id === 'string' && allowedIds[id]) recommendations[id] = true;
        return recommendations;
      }, {});
    } catch (error) {
      return {};
    }
  }

  function saveRecommendations(storageKey, recommendations) {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(Object.keys(recommendations)));
      return true;
    } catch (error) {
      return false;
    }
  }

  function isValid(value, allowed, fallback) {
    return allowed.indexOf(value) === -1 ? fallback : value;
  }

  function initialisePortal() {
    var search = document.getElementById('portalSearch');
    var sortSelect = document.getElementById('sortSelect');
    var resultsCount = document.getElementById('resultsCount');
    var grid = document.getElementById('modelGrid');
    var rankingList = document.getElementById('rankingList');
    var emptyState = document.getElementById('emptyState');
    var clearSearch = document.getElementById('clearSearch');
    if (!search || !sortSelect || !resultsCount || !grid || !rankingList || !emptyState || !clearSearch) return;

    var cards = Array.prototype.slice.call(grid.querySelectorAll('.model-card'));
    var validModelIds = {};

    function updateValidModelIds() {
      cards = Array.prototype.slice.call(grid.querySelectorAll('.model-card'));
      validModelIds = cards.reduce(function (ids, card) {
        if (card.dataset.modelId) ids[card.dataset.modelId] = true;
        return ids;
      }, {});
    }

    updateValidModelIds();
    var validModelIds = cards.reduce(function (ids, card) {
      if (card.dataset.modelId) ids[card.dataset.modelId] = true;
      return ids;
    }, {});
    var filterButtons = Array.prototype.slice.call(document.querySelectorAll('.filter-button[data-category]'));
    var countryButtons = Array.prototype.slice.call(document.querySelectorAll('.filter-button[data-country]'));
    var parameters = new URLSearchParams(window.location.search);
    var state = {
      query: parameters.get('q') || '',
      category: isValid(parameters.get('category') || 'all', VALID_CATEGORIES, 'all'),
      country: isValid(parameters.get('country') || 'all', VALID_COUNTRIES, 'all'),
      sort: isValid(parameters.get('sort') || 'popular', VALID_SORTS, 'popular')
    };
    var localRecommendations = getStoredRecommendations(LOCAL_STORAGE_KEY, validModelIds);
    var serverRecommendations = getStoredRecommendations(SERVER_STORAGE_KEY, validModelIds);
    var serverCounts = {};
    var pendingRecommendations = {};
    var recommendationErrors = {};
    var serverMode = false;

    function hasOwn(object, key) {
      return Object.prototype.hasOwnProperty.call(object, key);
    }

    function cardCount(card) {
      var id = card.dataset.modelId;
      var base = Number(card.dataset.baseRecommendations);
      if (serverMode) return hasOwn(serverCounts, id) ? serverCounts[id] : (Number.isFinite(base) ? base : 0);
      return (Number.isFinite(base) ? base : 0) + (localRecommendations[id] ? 1 : 0);
    }

    function updateRecommendationButton(card) {
      var id = card.dataset.modelId;
      var count = card.querySelector('[data-recommendation-count]');
      var button = card.querySelector('.recommend-button[data-recommend-model]');
      if (count) {
        var nextCount = cardCount(card);
        count.textContent = String(nextCount);
        count.hidden = nextCount <= 0;
      }
      if (!button) return;

      var recommended = serverMode ? Boolean(serverRecommendations[id]) : Boolean(localRecommendations[id]);
      var pending = Boolean(pendingRecommendations[id]);
      button.setAttribute('aria-pressed', String(recommended));
      button.disabled = recommended || pending;
      button.removeAttribute('title');
      if (pending) {
        button.textContent = 'Processing…';
        button.setAttribute('aria-label', 'Recommendation processing');
      } else if (recommended) {
        button.textContent = 'Recommended';
        button.setAttribute('aria-label', 'Recommendation completed');
      } else if (recommendationErrors[id]) {
        button.textContent = 'Retry';
        button.setAttribute('aria-label', recommendationErrors[id]);
        button.setAttribute('title', recommendationErrors[id]);
      } else {
        button.textContent = 'Recommend';
        button.setAttribute('aria-label', 'Recommend');
      }
    }

    function matches(card) {
      var fields = [card.dataset.name, card.dataset.altName, card.dataset.country, card.dataset.tags].join(' ').toLocaleLowerCase();
      var query = state.query.trim().toLocaleLowerCase();
      var categoryMatch = state.category === 'all' || card.dataset.category === state.category;
      var countryMatch = state.country === 'all' || card.dataset.country === state.country;
      var queryMatch = !query || fields.indexOf(query) !== -1;
      return categoryMatch && countryMatch && queryMatch;
    }

    function compareCards(first, second) {
      if (state.sort === 'latest') return String(second.dataset.updated || '').localeCompare(String(first.dataset.updated || ''));
      if (state.sort === 'name') return String(first.dataset.name || '').localeCompare(String(second.dataset.name || ''), 'ko');
      return cardCount(second) - cardCount(first) || String(first.dataset.name || '').localeCompare(String(second.dataset.name || ''), 'ko');
    }

    function renderRanking(displayedCards) {
      rankingList.replaceChildren();
      var rankedCards = displayedCards.slice().sort(function (first, second) {
        return cardCount(second) - cardCount(first) || String(first.dataset.name || '').localeCompare(String(second.dataset.name || ''), 'ko');
      });
      rankedCards.slice(0, 5).forEach(function (card, index) {
        var item = document.createElement('li');
        var rank = document.createElement('span');
        var name = document.createElement('span');
        var score = document.createElement('span');
        rank.className = 'rank-number';
        name.className = 'rank-name';
        score.className = 'rank-count';
        rank.textContent = String(index + 1);
        name.textContent = card.dataset.name || '';
        score.textContent = String(cardCount(card));
        item.append(rank, name, score);
        rankingList.append(item);
      });
    }

    function syncUrl() {
      try {
        var next = new URLSearchParams();
        if (state.query) next.set('q', state.query);
        next.set('category', state.category);
        next.set('country', state.country);
        next.set('sort', state.sort);
        window.history.replaceState(null, '', window.location.pathname + '?' + next.toString() + window.location.hash);
      } catch (error) {
        // Browsers without History API can still use the portal.
      }
    }

    function render(options) {
      var shouldSync = !options || options.sync !== false;
      search.value = state.query;
      sortSelect.value = state.sort;
      filterButtons.forEach(function (button) {
        var isActive = button.dataset.category === state.category;
        button.setAttribute('aria-pressed', String(isActive));
        button.classList.toggle('is-active', isActive);
      });
      countryButtons.forEach(function (button) {
        var isActive = button.dataset.country === state.country;
        button.setAttribute('aria-pressed', String(isActive));
        button.classList.toggle('is-active', isActive);
      });
      cards.forEach(updateRecommendationButton);
      var displayedCards = cards.filter(matches).sort(compareCards);
      cards.forEach(function (card) { card.hidden = displayedCards.indexOf(card) === -1; });
      displayedCards.forEach(function (card) { grid.append(card); });
      resultsCount.textContent = String(displayedCards.length) + ' profiles found';
      emptyState.hidden = displayedCards.length !== 0;
      renderRanking(displayedCards);
      if (shouldSync) syncUrl();
    }

    function validServerModel(model, id) {
      return model && model.modelId === id && isSafeCount(model.count);
    }

    function setServerMode(payload) {
      if (!payload || payload.ok !== true || !Array.isArray(payload.models)) return false;
      var nextCounts = {};
      payload.models.forEach(function (model) {
        if (model && validModelIds[model.modelId] && isSafeCount(model.count)) nextCounts[model.modelId] = model.count;
      });
      if (Object.keys(nextCounts).length === 0) return false;
      serverCounts = nextCounts;
      serverMode = true;
      return true;
    }

    function loadServerRecommendations() {
      if (typeof window.fetch !== 'function') return;
      window.fetch('/api/recommendations', {
        headers: { Accept: 'application/json' },
        credentials: 'same-origin',
        cache: 'no-store'
      }).then(function (response) {
        if (!response || !response.ok) throw new Error('recommendations_unavailable');
        return response.json();
      }).then(function (payload) {
        if (setServerMode(payload)) render({ sync: false });
      }).catch(function () {
        // Leave the immediate device-local recommendation mode active.
      });
    }

    function readRecommendationResponse(response) {
      return response.json().catch(function () { return null; }).then(function (payload) {
        return { response: response, payload: payload };
      });
    }

    function applyServerRecommendation(id, result) {
      var response = result.response;
      var payload = result.payload;
      var model = payload && payload.model;
      var isCreated = response.status === 201 && payload && payload.ok === true && payload.recommended === true;
      var isDuplicate = response.status === 409 && payload && payload.error && payload.error.code === 'already_recommended';
      if (!isCreated && !isDuplicate) {
        if (response.status === 429 || response.status === 403 || response.status >= 500) throw new Error('recommendation_unavailable');
        throw new Error('recommendation_failed');
      }
      if (validServerModel(model, id)) serverCounts[id] = model.count;
      serverRecommendations[id] = true;
      saveRecommendations(SERVER_STORAGE_KEY, serverRecommendations);
      delete recommendationErrors[id];
    }

    function recommendOnServer(card) {
      var id = card.dataset.modelId;
      var controller = typeof window.AbortController === 'function' ? new window.AbortController() : null;
      var timeoutId = null;
      var requestOptions = {
        method: 'POST',
        headers: { Accept: 'application/json' },
        credentials: 'same-origin',
        cache: 'no-store'
      };
      pendingRecommendations[id] = true;
      delete recommendationErrors[id];
      render({ sync: false });
      if (controller) {
        requestOptions.signal = controller.signal;
        timeoutId = window.setTimeout(function () { controller.abort(); }, 8000);
      }
      window.fetch('/api/recommendations/' + encodeURIComponent(id), requestOptions).then(readRecommendationResponse).then(function (result) {
        applyServerRecommendation(id, result);
      }).catch(function () {
        recommendationErrors[id] = 'Cannot process recommendation. Please try again later.';
      }).then(function () {
        if (timeoutId !== null) window.clearTimeout(timeoutId);
        delete pendingRecommendations[id];
        render({ sync: false });
      });
    }

    filterButtons.forEach(function (button) {
      button.addEventListener('click', function () {
        state.category = isValid(button.dataset.category, VALID_CATEGORIES, 'all');
        render();
      });
    });
    countryButtons.forEach(function (button) {
      button.addEventListener('click', function () {
        state.country = isValid(button.dataset.country, VALID_COUNTRIES, 'all');
        render();
      });
    });
    search.addEventListener('input', function () { state.query = search.value; render(); });
    sortSelect.addEventListener('change', function () { state.sort = isValid(sortSelect.value, VALID_SORTS, 'popular'); render(); });
    grid.addEventListener('click', function (event) {
      var button = event.target.closest('.recommend-button[data-recommend-model]');
      if (!button || button.disabled) return;
      var card = button.closest('.model-card[data-model-id]');
      var id = card && card.dataset.modelId;
      if (!card || id !== button.dataset.recommendModel || !validModelIds[id] || pendingRecommendations[id]) return;
      if (serverMode) {
        if (!serverRecommendations[id]) recommendOnServer(card);
      } else if (!localRecommendations[id]) {
        localRecommendations[id] = true;
        saveRecommendations(LOCAL_STORAGE_KEY, localRecommendations);
        render();
      }
    });
    clearSearch.addEventListener('click', function () {
      state.query = '';
      state.category = 'all';
      state.country = 'all';
      state.sort = 'popular';
      render();
      search.focus();
    });

    render({ sync: true });
    loadServerRecommendations();

    document.addEventListener('portal-models-loaded', function () {
      updateValidModelIds();
      render({ sync: false });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialisePortal, { once: true });
  } else {
    initialisePortal();
  }
}());

(function () {
  'use strict';

  function trackAffiliateClick(link) {
    try {
      var label = link.getAttribute('data-affiliate') || 'unknown';
      var href = link.getAttribute('href') || '';
      if (typeof window.navigator !== 'undefined' && typeof window.navigator.sendBeacon === 'function') {
        // Placeholder for future analytics endpoint. Beacons are fire-and-forget
        // so they never block navigation or break the user journey.
        // window.navigator.sendBeacon('/api/affiliate-click?label=' + encodeURIComponent(label));
      }
      if (typeof window.console !== 'undefined' && typeof window.console.debug === 'function') {
        window.console.debug('affiliate click', label, href);
      }
    } catch (error) {
      // Tracking must never break the user journey.
    }
  }

  function setupAffiliateTracking() {
    var links = typeof document !== 'undefined' ? document.querySelectorAll('a[data-affiliate]') : null;
    if (!links || !links.length) return;
    Array.prototype.forEach.call(links, function (link) {
      link.addEventListener('click', function () { trackAffiliateClick(link); }, false);
    });
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', setupAffiliateTracking, { once: true });
    } else {
      setupAffiliateTracking();
    }
  }
}());

(function () {
  'use strict';

  // JuicyAds banner (zone 1123909, 300x250). The network's loader script is
  // injected here at runtime rather than hardcoded in index.html: a homepage
  // test forbids any https:// <script src> in the static markup, so the ad is
  // mounted into the #ad-zone-banner container only in a real browser. Wrapped
  // in try/catch so an ad-network failure can never break the directory.
  var JUICY_ZONE_ID = 1123909;
  var JUICY_LOADER_URL = 'https://poweredby.jads.co/js/jads.js';
  var MOUNT_ID = 'ad-zone-banner';

  function mountJuicyAd() {
    try {
      if (typeof document === 'undefined' || typeof window === 'undefined') return;
      var mount = document.getElementById(MOUNT_ID);
      if (!mount) return;
      if (mount.getAttribute('data-juicy-mounted') === '1') return; // idempotent
      mount.setAttribute('data-juicy-mounted', '1');

      var ins = document.createElement('ins');
      ins.setAttribute('id', String(JUICY_ZONE_ID));
      ins.setAttribute('data-width', '300');
      ins.setAttribute('data-height', '250');
      mount.appendChild(ins);

      window.adsbyjuicy = window.adsbyjuicy || [];
      window.adsbyjuicy.push({ adzone: JUICY_ZONE_ID });

      if (!document.getElementById('juicyads-loader')) {
        var loader = document.createElement('script');
        loader.id = 'juicyads-loader';
        loader.type = 'text/javascript';
        loader.setAttribute('data-cfasync', 'false');
        loader.async = true;
        loader.src = JUICY_LOADER_URL;
        var head = document.head || document.body;
        if (head) head.appendChild(loader);
      }
    } catch (error) {
      // Ads must never break the page.
    }
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', mountJuicyAd, { once: true });
    } else {
      mountJuicyAd();
    }
  }
}());

(function () {
  'use strict';

  var MODELS_JSON_URL = '/data/models.json';
  var INITIAL_BATCH_SIZE = 6;
  var LOAD_MORE_BATCH_SIZE = 20;

  function buildMonogram(name) {
    if (!name) return '';
    var parts = String(name).split(/\s+/).filter(Boolean);
    return parts.slice(0, 2).map(function (p) { return p.charAt(0); }).join('').toUpperCase();
  }

  // Pre-render shape check. A model missing core fields is skipped before it can
  // throw inside createModelCard and poison the rest of the batch.
  function isValidModel(model) {
    if (!model || typeof model !== 'object') return false;
    if (typeof model.id !== 'string' || !model.id) return false;
    if (typeof model.name !== 'string' || !model.name) return false;
    if (typeof model.country !== 'string' || !model.country) return false;
    if (typeof model.tags !== 'string' && !Array.isArray(model.tags)) return false;
    if (typeof model.sns !== 'object' || model.sns === null || Array.isArray(model.sns)) return false;
    return true;
  }

  function createModelCard(model, baseRecommendations) {
    var card = document.createElement('article');
    card.className = 'model-card story-card';
    card.dataset.modelId = model.id;
    card.dataset.name = model.name;
    card.dataset.altName = model.altName || '';
    card.dataset.country = model.country;

    // models.json stores tags as a space-delimited string ("cosplay gravure tv").
    // Normalize once so every consumer below works against a real array.
    var rawTags = model.tags;
    var tags = typeof rawTags === 'string'
      ? rawTags.split(/\s+/).filter(Boolean)
      : (Array.isArray(rawTags) ? rawTags : []);
    card.dataset.tags = tags.join(' ');
    card.dataset.updated = '2026-08-02';
    card.dataset.baseRecommendations = String(baseRecommendations || 0);

    var category = 'model';
    if (tags.indexOf('cosplay') !== -1) category = 'cosplay';
    else if (tags.indexOf('gravure') !== -1) category = 'gravure';
    card.dataset.category = category;

    var portraitClass = 'portrait portrait-' + ['luna', 'hana', 'aria', 'mio', 'noa', 'sora'][Math.floor(Math.random() * 6)];
    var portrait = document.createElement('div');
    portrait.className = portraitClass;
    portrait.setAttribute('role', 'img');

    // Swaps a portrait to its monogram fallback. Used both for models with no
    // photo and as the onerror recovery when a declared photo 404s or fails to
    // decode. Idempotent: safe to call on an already-fallback portrait.
    function applyMonogramFallback() {
      var monogram = buildMonogram(model.name);
      portrait.setAttribute('data-monogram', monogram);
      portrait.setAttribute('aria-label', model.name + ' photo (monogram only)');
      var brokenImg = portrait.querySelector('img');
      if (brokenImg && brokenImg.parentNode) brokenImg.parentNode.removeChild(brokenImg);
      if (!portrait.querySelector('span')) {
        var noPhotoSpan = document.createElement('span');
        noPhotoSpan.textContent = 'NO PHOTO';
        portrait.appendChild(noPhotoSpan);
      }
    }

    if (model.photoAvailable) {
      portrait.setAttribute('aria-label', model.name + ' photo');
      var img = document.createElement('img');
      img.src = '/assets/profiles/' + model.id + '.jpg';
      img.alt = model.name + ' photo';
      img.setAttribute('loading', 'lazy');
      // Defense-in-depth: if the photo 404s or fails to load, recover to the
      // monogram so the grid never renders a broken-image icon.
      img.addEventListener('error', applyMonogramFallback);
      portrait.appendChild(img);
    } else {
      applyMonogramFallback();
    }

    var cardBody = document.createElement('div');
    cardBody.className = 'card-body';

    var categoryLabel = document.createElement('p');
    categoryLabel.className = 'category-label';
    categoryLabel.textContent = category.toUpperCase() + ' · ' + model.country;

    var nameHeading = document.createElement('h3');
    nameHeading.textContent = model.name;
    if (model.altName) {
      var small = document.createElement('small');
      small.textContent = model.altName;
      nameHeading.appendChild(small);
    }

    var profileLine = document.createElement('p');
    profileLine.className = 'profile-line';
    profileLine.textContent = 'Official profile · ' + tags.length + ' registered tags';

    var tagList = document.createElement('div');
    tagList.className = 'tag-list';
    var tagArray = tags.slice(0, 3);
    tagArray.forEach(function (tag) {
      var span = document.createElement('span');
      span.textContent = tag.charAt(0).toUpperCase() + tag.slice(1);
      tagList.appendChild(span);
    });

    var sourceLinks = document.createElement('p');
    sourceLinks.className = 'source-links';

    // Only render links for sources the model actually has. We never fabricate
    // "Find on X" search links — a card shows real channels, or (when a profile
    // has zero real links) a single honest "Search" escape hatch.
    function addSourceLink(href, label) {
      var link = document.createElement('a');
      link.target = '_blank';
      link.href = href;
      link.rel = 'noopener noreferrer';
      link.textContent = label;
      sourceLinks.appendChild(link);
    }

    var realSourceCount = 0;
    if (model.officialUrl) { addSourceLink(model.officialUrl, 'Official Profile'); realSourceCount++; }
    if (model.sns && model.sns.x) { addSourceLink(model.sns.x, 'X'); realSourceCount++; }
    if (model.sns && model.sns.instagram) { addSourceLink(model.sns.instagram, 'Instagram'); realSourceCount++; }
    if (model.sns && model.sns.youtube) { addSourceLink(model.sns.youtube, 'YouTube'); realSourceCount++; }

    if (realSourceCount === 0) {
      var searchQuery = encodeURIComponent((model.name + ' ' + (model.altName || '')).trim());
      var searchLink = document.createElement('a');
      searchLink.target = '_blank';
      searchLink.href = 'https://www.google.com/search?q=' + searchQuery;
      searchLink.rel = 'noopener noreferrer nofollow';
      searchLink.textContent = 'Search';
      sourceLinks.appendChild(searchLink);
    }

    // Subtle photo attribution: where the photo came from + its license, as a
    // quiet footnote. This is NOT a "verified source" claim — the model's own
    // official channels (source-links above) are the directory's real source.
    // Per-model license/credit so a copyrighted photo is never mislabelled CC;
    // models without those fields fall back to the CC/Wikimedia default.
    var creditLicense = (model.license && String(model.license)) || 'CC BY-SA 4.0';
    var creditText = (model.creditText && String(model.creditText)) || 'Wikimedia Commons';
    var creditUrl = (model.creditUrl && String(model.creditUrl)) || 'https://commons.wikimedia.org/';
    var photoCredit = document.createElement('p');
    photoCredit.className = 'photo-credit';
    photoCredit.textContent = 'Photo · ' + creditLicense + ' · ';
    var creditLink = document.createElement('a');
    creditLink.href = creditUrl;
    creditLink.target = '_blank';
    creditLink.rel = 'noopener noreferrer';
    creditLink.textContent = creditText;
    photoCredit.appendChild(creditLink);

    var cardFooter = document.createElement('div');
    cardFooter.className = 'card-footer';

    var time = document.createElement('time');
    time.dateTime = '2026-08-02';
    time.textContent = 'Verified 2026.08.02';

    // The recommend count stays hidden until it is non-zero. An always-"0"
    // count reads as an empty social feature on a directory; the count earns
    // its place only once someone has actually recommended the profile.
    var recommendWrap = document.createElement('div');
    recommendWrap.className = 'recommend-wrap';

    var recommendCount = document.createElement('span');
    recommendCount.className = 'recommend-count';
    recommendCount.setAttribute('data-recommendation-count', '');
    recommendCount.hidden = true;
    recommendCount.textContent = '0';

    var recommendButton = document.createElement('button');
    recommendButton.className = 'recommend-button';
    recommendButton.type = 'button';
    recommendButton.setAttribute('data-recommend-model', model.id);
    recommendButton.setAttribute('aria-pressed', 'false');
    recommendButton.textContent = 'Recommend';

    recommendWrap.appendChild(recommendCount);
    recommendWrap.appendChild(recommendButton);

    cardFooter.appendChild(time);
    cardFooter.appendChild(recommendWrap);

    cardBody.appendChild(categoryLabel);
    cardBody.appendChild(nameHeading);
    cardBody.appendChild(profileLine);
    cardBody.appendChild(tagList);
    cardBody.appendChild(sourceLinks);
    cardBody.appendChild(photoCredit);
    cardBody.appendChild(cardFooter);

    card.appendChild(portrait);
    card.appendChild(cardBody);

    return card;
  }

  // Renders a batch of models into the grid. Each model is validated and wrapped
  // in its own try/catch so a single bad entry (missing field, unexpected type,
  // thrown error inside createModelCard) is skipped with a warning instead of
  // aborting the whole batch and surfacing as a "load failure".
  function renderCards(models, grid, baseRecommendations) {
    var base = baseRecommendations || 0;
    models.forEach(function (model) {
      if (!isValidModel(model)) {
        if (typeof console !== 'undefined' && console.warn) {
          console.warn('Skipping invalid model:', model && model.id);
        }
        return;
      }
      try {
        var card = createModelCard(model, base);
        grid.appendChild(card);
      } catch (error) {
        if (typeof console !== 'undefined' && console.warn) {
          console.warn('Failed to render model', model.id, error);
        }
      }
    });
  }

  // Directory gate: only models with a real, reconciled profile photo are shown.
  // Photo-less entries are filtered out of the loaded set (NOT deleted from the
  // data), so every downstream step — search, filter, sort, ranking, load-more —
  // only ever sees publishable profiles. Dropping a photo into assets/profiles/
  // and rebuilding restores a hidden model automatically.
  function selectPublishedModels(models) {
    return (Array.isArray(models) ? models : []).filter(function (model) {
      return model && model.photoAvailable === true;
    });
  }

  function initDynamicModels() {
    var grid = document.getElementById('modelGrid');
    if (!grid) return;

    // Add test attribute to verify dynamic loading started
    grid.setAttribute('data-dynamic-loading', 'true');

    // Clear existing static cards before loading dynamic models
    while (grid.firstChild) {
      grid.removeChild(grid.firstChild);
    }

    var loadMoreButton = document.createElement('button');
    loadMoreButton.id = 'loadMoreButton';
    loadMoreButton.className = 'load-more-button';
    loadMoreButton.textContent = 'Load More';
    loadMoreButton.hidden = true;
    loadMoreButton.addEventListener('click', function () {
      loadNextBatch();
    });

    if (grid && grid.parentNode) {
      grid.parentNode.insertBefore(loadMoreButton, grid.nextSibling);
    }

    var allModels = [];
    var displayedCount = 0;

    function loadNextBatch() {
      var nextBatch = allModels.slice(displayedCount, displayedCount + LOAD_MORE_BATCH_SIZE);
      renderCards(nextBatch, grid, 0);
      displayedCount += nextBatch.length;

      if (displayedCount >= allModels.length) {
        loadMoreButton.hidden = true;
      } else {
        loadMoreButton.hidden = false;
        loadMoreButton.textContent = 'Load More (' + (allModels.length - displayedCount) + ' remaining)';
      }

      var portalEvent = new CustomEvent('portal-models-loaded', { detail: { count: nextBatch.length } });
      document.dispatchEvent(portalEvent);
    }

    if (typeof window.fetch === 'function') {
      window.fetch(MODELS_JSON_URL, {
        headers: { Accept: 'application/json' },
        cache: 'no-cache'
      }).then(function (response) {
        if (!response || !response.ok) throw new Error('models_json_unavailable');
        return response.json();
      }).then(function (data) {
        if (!data || !Array.isArray(data.models)) throw new Error('invalid_models_json');
        allModels = selectPublishedModels(data.models);
        loadNextBatch();
      }).catch(function (error) {
        console.error('Failed to load models.json:', error);
        if (grid.children.length === 0) {
          var errorP = document.createElement('p');
          errorP.className = 'error-state';
          errorP.textContent = 'Failed to load model profiles. Please refresh the page.';
          grid.appendChild(errorP);
        }
      });
    }
  }

  function initProfileModal() {
    var modal = typeof document !== 'undefined' ? document.getElementById('profileModal') : null;
    if (!modal) return;

    var image = modal.querySelector('.modal-image');
    var categoryEl = modal.querySelector('.modal-category');
    var titleEl = modal.querySelector('#modalTitle');
    var summaryEl = modal.querySelector('.modal-summary');
    var countryEl = modal.querySelector('[data-modal-country]');
    var updatedEl = modal.querySelector('[data-modal-updated]');
    var recEl = modal.querySelector('[data-modal-recommendations]');
    var actionsEl = modal.querySelector('[data-modal-actions]');
    var lastFocus = null;

    function clearActions() {
      while (actionsEl && actionsEl.firstChild) actionsEl.removeChild(actionsEl.firstChild);
    }

    function fillModal(card) {
      var recCount = card.querySelector('[data-recommendation-count]');
      var profileLine = card.querySelector('.profile-line');
      var categoryLabel = card.querySelector('.category-label');
      var portrait = card.querySelector('.portrait');
      var photo = card.querySelector('.portrait img');
      var photoCredit = card.querySelector('.photo-credit');
      var sourceLinks = card.querySelectorAll('.source-links a');

      var name = card.dataset.name || '';
      var altName = card.dataset.altName || '';
      var monogram = portrait && portrait.dataset.monogram ? portrait.dataset.monogram : buildMonogram(name);

      if (categoryEl) categoryEl.textContent = categoryLabel ? categoryLabel.textContent.trim() : '';
      if (titleEl) titleEl.textContent = name + (altName ? ' ' + altName : '');
      if (summaryEl) summaryEl.textContent = profileLine ? profileLine.textContent.trim() : '';
      if (countryEl) countryEl.textContent = card.dataset.country || '';
      if (updatedEl) updatedEl.textContent = card.dataset.updated || '';
      if (recEl) recEl.textContent = recCount ? recCount.textContent.trim() : '0';

      if (image) {
        image.classList.remove('is-portrait');
        image.style.backgroundImage = '';
        image.setAttribute('data-monogram', monogram);
        image.setAttribute('aria-label', photo ? (photo.getAttribute('alt') || name) : (name + ' 모노그램'));
        if (photo && photo.getAttribute('src')) {
          var src = photo.getAttribute('src');
          if (typeof window !== 'undefined' && typeof window.Image === 'function') {
            var preloader = new window.Image();
            preloader.onload = function () {
              image.classList.add('is-portrait');
              image.style.backgroundImage = 'url("' + src + '")';
            };
            preloader.onerror = function () { /* keep monogram fallback on image error */ };
            preloader.src = src;
          } else {
            image.classList.add('is-portrait');
            image.style.backgroundImage = 'url("' + src + '")';
          }
        }
      }

      if (actionsEl) {
        clearActions();
        Array.prototype.forEach.call(sourceLinks, function (link) {
          var anchor = document.createElement('a');
          anchor.href = link.getAttribute('href') || '';
          anchor.textContent = link.textContent.trim();
          anchor.target = '_blank';
          anchor.rel = 'noopener noreferrer';
          actionsEl.append(anchor);
        });
        if (photoCredit) {
          var credit = document.createElement('p');
          credit.className = 'photo-credit';
          Array.prototype.forEach.call(photoCredit.childNodes, function (node) {
            credit.append(node.cloneNode(true));
          });
          actionsEl.append(credit);
        }
      }
    }

    function openModal(card) {
      lastFocus = typeof document !== 'undefined' && document.activeElement ? document.activeElement : null;
      fillModal(card);
      modal.hidden = false;
      if (typeof document !== 'undefined' && document.body) document.body.style.overflow = 'hidden';
      var closeBtn = modal.querySelector('.modal-close');
      if (closeBtn && typeof closeBtn.focus === 'function') closeBtn.focus();
    }

    function closeModal() {
      modal.hidden = true;
      if (typeof document !== 'undefined' && document.body) document.body.style.overflow = '';
      if (lastFocus && typeof lastFocus.focus === 'function') lastFocus.focus();
    }

    function isInteractive(event) {
      return Boolean(event.target.closest('a, button, .recommend-button, .source-links, .tag-list'));
    }

    document.addEventListener('click', function (event) {
      if (event.defaultPrevented) return;
      var card = event.target.closest('.model-card.story-card[data-model-id]');
      if (!card) return;
      if (isInteractive(event)) return;
      event.preventDefault();
      openModal(card);
    });

    modal.addEventListener('click', function (event) {
      if (event.target.closest('[data-modal-close]')) closeModal();
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && !modal.hidden) closeModal();
    });
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () {
        initProfileModal();
        initDynamicModels();
      }, { once: true });
    } else {
      initProfileModal();
      initDynamicModels();
    }
  }
}());
