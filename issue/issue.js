// issue.js — 글로벌 이슈 수집기 클라이언트 필터/렌더 (핫이슈 뉴스 전용)
// 홈과 동일한 발견바(카테고리/시간/정렬/검색) + 뉴스 헤드라인 카드 렌더.

(function () {
  'use strict';

  var items = [];
  var filtered = [];
  var firstScrapedAt = 0;
  var page = 1;
  var PAGE_SIZE = 15;

  var CAT_LABEL = {
    gravure: '그라비아',
    cosplay: '코스프레',
    model: '모델',
    upload: '셀프',
  };

  function init() {
    var el = document.getElementById('issue-data');
    if (!el) return;
    try {
      items = JSON.parse(el.textContent);
    } catch (e) {
      console.error('issue data parse 실패:', e);
      items = [];
    }
    items = items.filter(function (i) { return i.platform === 'news'; });
    firstScrapedAt = readScrapedAt();

    var metaCount = document.querySelector('[data-registry-count]');
    if (metaCount) metaCount.textContent = items.length;

    var params = getParams();
    var searchEl = document.getElementById('search');
    if (searchEl && params.q) searchEl.value = params.q;
    var sortEl = document.getElementById('sortSelect');
    if (sortEl && params.sort) sortEl.value = params.sort;

    applyFilters(params);
    bindControls();
  }

  function readScrapedAt() {
    var metaEl = document.getElementById('issue-meta');
    if (metaEl) {
      try {
        var meta = JSON.parse(metaEl.textContent);
        if (meta && meta.scraped_at) {
          var t = Date.parse(meta.scraped_at);
          if (!Number.isNaN(t)) return Math.floor(t / 1000);
        }
      } catch (e) { /* fallback */ }
    }
    return items.length ? (items[0].created_utc || 0) : 0;
  }

  function bindControls() {
    var bar = document.getElementById('discover');
    if (bar) {
      bar.addEventListener('click', function (e) {
        var t = e.target;
        if (!t || t.tagName !== 'BUTTON') return;
        var attr = null;
        var value = null;
        if (t.hasAttribute('data-category')) { attr = 'cat'; value = t.getAttribute('data-category'); }
        else if (t.hasAttribute('data-time')) { attr = 'time'; value = t.getAttribute('data-time'); }
        if (!attr) return;
        var params = getParams();
        if (value === 'all') delete params[attr];
        else params[attr] = value;
        location.hash = hashFor(params);
        applyFilters(params);
      });
    }

    var searchEl = document.getElementById('search');
    if (searchEl) {
      var timer;
      searchEl.addEventListener('input', function () {
        clearTimeout(timer);
        var val = searchEl.value;
        timer = setTimeout(function () {
          var params = getParams();
          if (val) params.q = val; else delete params.q;
          location.hash = hashFor(params);
          applyFilters(params);
        }, 180);
      });
    }

    var sortEl = document.getElementById('sortSelect');
    if (sortEl) {
      sortEl.addEventListener('change', function () {
        var params = getParams();
        params.sort = sortEl.value;
        location.hash = hashFor(params);
        applyFilters(params);
      });
    }

    var clearBtn = document.getElementById('clearSearch');
    if (clearBtn) {
      clearBtn.addEventListener('click', function () {
        var searchEl2 = document.getElementById('search');
        if (searchEl2) searchEl2.value = '';
        location.hash = '';
        applyFilters(getParams());
      });
    }

    window.addEventListener('popstate', function () { applyFilters(getParams()); });
  }

  function hashFor(params) {
    var parts = [];
    if (params.cat && params.cat !== 'all') parts.push('cat=' + params.cat);
    if (params.time && params.time !== 'all') parts.push('time=' + params.time);
    if (params.sort && params.sort !== 'time') parts.push('sort=' + params.sort);
    if (params.q) parts.push('q=' + params.q);
    return parts.length ? '#' + parts.join('&') : '';
  }

  function getParams() {
    var params = {};
    var hash = window.location.hash.slice(1) || window.location.search.slice(1);
    if (!hash) return params;
    hash.split('&').forEach(function (pair) {
      var eq = pair.indexOf('=');
      if (eq > -1) {
        params[decodeURIComponent(pair.slice(0, eq))] = decodeURIComponent(pair.slice(eq + 1));
      }
    });
    return params;
  }

  function applyFilters(params) {
    var cat = params.cat || 'all';
    var time = params.time || 'all';
    var sort = params.sort || 'time';
    var text = params.q || '';

    filtered = items.slice();

    if (cat !== 'all') {
      filtered = filtered.filter(function (i) { return i.category === cat; });
    }
    if (time !== 'all') {
      var now = Date.now();
      var cutoff = 0;
      if (time === '24h') cutoff = 24 * 3600 * 1000;
      else if (time === 'week') cutoff = 7 * 24 * 3600 * 1000;
      else if (time === 'month') cutoff = 30 * 24 * 3600 * 1000;
      if (cutoff) {
        filtered = filtered.filter(function (i) { return i.created_utc && (now - i.created_utc * 1000) < cutoff; });
      }
    }
    if (text) {
      var lower = text.toLowerCase();
      filtered = filtered.filter(function (i) { return (i.title || '').toLowerCase().indexOf(lower) !== -1; });
    }

    filtered.sort(function (a, b) {
      if (sort === 'src') {
        if (a.source !== b.source) return a.source.localeCompare(b.source);
        return b.created_utc - a.created_utc;
      }
      return b.created_utc - a.created_utc;
    });

    page = 1;
    renderList();
    renderCount(filtered.length);
    updateActive(cat, time, sort);
  }

  function goToPage(number, totalPages) {
    if (number < 1 || number > totalPages || number === page) return;
    page = number;
    renderList();
    var posts = document.getElementById('posts');
    if (posts && typeof posts.scrollIntoView === 'function') {
      posts.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function renderPagination(totalItems, totalPages) {
    var nav = document.getElementById('pagination');
    if (!nav) return;
    nav.replaceChildren();
    if (!totalItems || totalPages <= 1) return;

    var control = document.createElement('div');
    control.className = 'pagination-control';

    var prev = document.createElement('button');
    prev.type = 'button';
    prev.className = 'pagination-arrow';
    prev.setAttribute('aria-label', '이전 페이지');
    prev.textContent = '‹';
    prev.disabled = page <= 1;
    prev.addEventListener('click', function () { goToPage(page - 1, totalPages); });
    control.append(prev);

    for (var index = 1; index <= totalPages; index += 1) {
      var pageButton = document.createElement('button');
      pageButton.type = 'button';
      pageButton.className = 'pagination-page';
      pageButton.textContent = String(index);
      pageButton.setAttribute('aria-label', index + ' 페이지');
      if (index === page) {
        pageButton.classList.add('is-active');
        pageButton.setAttribute('aria-current', 'page');
      }
      (function (number) {
        pageButton.addEventListener('click', function () { goToPage(number, totalPages); });
      }(index));
      control.append(pageButton);
    }

    var next = document.createElement('button');
    next.type = 'button';
    next.className = 'pagination-arrow';
    next.setAttribute('aria-label', '다음 페이지');
    next.textContent = '›';
    next.disabled = page >= totalPages;
    next.addEventListener('click', function () { goToPage(page + 1, totalPages); });
    control.append(next);

    nav.append(control);
  }

  function renderList() {
    var totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    page = Math.min(Math.max(1, page), totalPages);
    var start = (page - 1) * PAGE_SIZE;
    var slice = filtered.slice(start, start + PAGE_SIZE);
    renderPosts(slice);
    renderPagination(filtered.length, totalPages);
  }

  function renderPosts(list) {
    var grid = document.getElementById('postGrid');
    var empty = document.getElementById('emptyState');
    if (!grid) return;
    if (!list.length) {
      grid.innerHTML = '';
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.hidden = true;
    var html = '';
    list.forEach(function (it, idx) {
      html += renderCard(idx + 1, it);
    });
    grid.innerHTML = html;
  }

  function renderCard(idx, it) {
    var catLabel = CAT_LABEL[it.category] || it.category || '기타';
    var time = it.created_utc ? timeAgo(it.created_utc) : '시간 미상';
    var author = it.author || it.source || '';
    return '<a class="model-card post-card" href="' + escapeHtml(it.url) + '" target="_blank" rel="noopener nofollow">'
      + '<p class="category-label">' + escapeHtml(catLabel) + '</p>'
      + '<h3>' + escapeHtml(it.title) + '<small>' + escapeHtml(author) + '</small></h3>'
      + '<div class="card-footer">'
        + '<span class="recommend-count">' + time + '</span>'
        + '<span class="card-detail-link">기사 읽기 →</span>'
      + '</div>'
    + '</a>';
  }

  function renderCount(count) {
    var el = document.getElementById('resultsCount');
    if (el) {
      var txt = count + '건';
      if (firstScrapedAt) txt += ' · 수집 ' + timeAgo(firstScrapedAt) + ' 갱신';
      el.textContent = txt;
    }
  }

  function updateActive(cat, time, sort) {
    document.querySelectorAll('[data-category]').forEach(function (btn) {
      var active = btn.getAttribute('data-category') === cat;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', String(active));
    });
    document.querySelectorAll('[data-time]').forEach(function (btn) {
      var active = btn.getAttribute('data-time') === time;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', String(active));
    });
    var sortEl = document.getElementById('sortSelect');
    if (sortEl && sortEl.value !== sort) sortEl.value = sort;
  }

  function timeAgo(unix) {
    var diff = Date.now() - unix * 1000;
    var mins = Math.floor(diff / 60000);
    if (mins < 60) return mins + '분전';
    var hours = Math.floor(mins / 60);
    if (hours < 24) return hours + '시간전';
    var days = Math.floor(hours / 24);
    if (days < 7) return days + '일전';
    if (days < 30) return Math.floor(days / 7) + '주전';
    return Math.floor(days / 30) + '달전';
  }

  function escapeHtml(str) {
    if (str == null) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
