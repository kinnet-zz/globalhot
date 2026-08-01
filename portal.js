(function () {
  'use strict';

  var DEMO_STORAGE_KEY = 'globalhot-demo-recommendations-v1';
  var SERVER_STORAGE_KEY = 'globalhot-recommendations-v2';
  var VALID_CATEGORIES = ['all', 'model', 'cosplay', 'gravure'];
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
    var validModelIds = cards.reduce(function (ids, card) {
      if (card.dataset.modelId) ids[card.dataset.modelId] = true;
      return ids;
    }, {});
    var filterButtons = Array.prototype.slice.call(document.querySelectorAll('.filter-button[data-category]'));
    var parameters = new URLSearchParams(window.location.search);
    var state = {
      query: parameters.get('q') || '',
      category: isValid(parameters.get('category') || 'all', VALID_CATEGORIES, 'all'),
      sort: isValid(parameters.get('sort') || 'popular', VALID_SORTS, 'popular')
    };
    var demoRecommendations = getStoredRecommendations(DEMO_STORAGE_KEY, validModelIds);
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
      return (Number.isFinite(base) ? base : 0) + (demoRecommendations[id] ? 1 : 0);
    }

    function updateRecommendationButton(card) {
      var id = card.dataset.modelId;
      var count = card.querySelector('[data-recommendation-count]');
      var button = card.querySelector('.recommend-button[data-recommend-model]');
      if (count) count.textContent = String(cardCount(card));
      if (!button) return;

      var recommended = serverMode ? Boolean(serverRecommendations[id]) : Boolean(demoRecommendations[id]);
      var pending = Boolean(pendingRecommendations[id]);
      button.setAttribute('aria-pressed', String(recommended));
      button.disabled = recommended || pending;
      button.removeAttribute('title');
      if (pending) {
        button.textContent = '처리 중…';
        button.setAttribute('aria-label', '추천 처리 중');
      } else if (recommended) {
        button.textContent = '추천 완료';
        button.setAttribute('aria-label', '추천 완료');
      } else if (recommendationErrors[id]) {
        button.textContent = '다시 시도';
        button.setAttribute('aria-label', recommendationErrors[id]);
        button.setAttribute('title', recommendationErrors[id]);
      } else {
        button.textContent = '추천';
        button.setAttribute('aria-label', '추천');
      }
    }

    function matches(card) {
      var fields = [card.dataset.name, card.dataset.altName, card.dataset.country, card.dataset.tags].join(' ').toLocaleLowerCase();
      var query = state.query.trim().toLocaleLowerCase();
      return (state.category === 'all' || card.dataset.category === state.category) && (!query || fields.indexOf(query) !== -1);
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
      rankedCards.forEach(function (card, index) {
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
      cards.forEach(updateRecommendationButton);
      var displayedCards = cards.filter(matches).sort(compareCards);
      cards.forEach(function (card) { card.hidden = displayedCards.indexOf(card) === -1; });
      displayedCards.forEach(function (card) { grid.append(card); });
      resultsCount.textContent = String(displayedCards.length) + '개의 모델을 찾았습니다';
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
        // Leave the immediate device-local demo recommendation mode active.
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
        recommendationErrors[id] = '추천을 처리할 수 없습니다. 잠시 후 다시 시도해 주세요.';
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
      } else if (!demoRecommendations[id]) {
        demoRecommendations[id] = true;
        saveRecommendations(DEMO_STORAGE_KEY, demoRecommendations);
        render();
      }
    });
    clearSearch.addEventListener('click', function () {
      state.query = '';
      state.category = 'all';
      state.sort = 'popular';
      render();
      search.focus();
    });

    render({ sync: true });
    loadServerRecommendations();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialisePortal, { once: true });
  } else {
    initialisePortal();
  }
}());
