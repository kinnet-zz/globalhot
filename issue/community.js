// community.js — 19+ 커뮤니티 링크 보드 클라이언트
// 성인 인증 게이트(localStorage) + 링크 목록 렌더 + 제목 검색.

(function () {
  'use strict';

  var items = [];
  var filtered = [];
  var page = 1;
  var PAGE_SIZE = 10;
  var ADULT_KEY = 'gh_adult';

  function init() {
    var gate = document.getElementById('adultGate');
    var accepted = false;
    try { accepted = localStorage.getItem(ADULT_KEY) === '1'; } catch (e) { /* private mode */ }

    if (accepted) {
      closeGate();
      bindAndRender();
    } else {
      bindGate();
    }
  }

  function bindGate() {
    var gate = document.getElementById('adultGate');
    if (!gate) return;
    document.body.classList.add('gate-locked');

    var accept = document.getElementById('gateAccept');
    var reject = document.getElementById('gateReject');
    if (accept) {
      accept.addEventListener('click', function () {
        try { localStorage.setItem(ADULT_KEY, '1'); } catch (e) { /* private mode */ }
        closeGate();
        bindAndRender();
      });
    }
    if (reject) {
      reject.addEventListener('click', function () {
        gate.classList.add('gate-rejected');
        var desc = document.getElementById('gate-desc');
        if (desc) desc.textContent = '본 보드는 19세 이상만 열람할 수 있습니다. 접근이 거부되었습니다.';
      });
    }
  }

  function closeGate() {
    var gate = document.getElementById('adultGate');
    if (gate) gate.hidden = true;
    document.body.classList.remove('gate-locked');
  }

  function bindAndRender() {
    var el = document.getElementById('community-data');
    if (el) {
      try { items = JSON.parse(el.textContent); } catch (e) { items = []; }
    }
    items = items.filter(function (i) { return i.platform === 'community'; });
    items.sort(function (a, b) { return (b.created_utc || 0) - (a.created_utc || 0); });

    var count = document.querySelector('[data-registry-count]');
    if (count) count.textContent = items.length;

    applyFilter();

    var search = document.getElementById('search');
    if (search) {
      var timer;
      search.addEventListener('input', function () {
        clearTimeout(timer);
        timer = setTimeout(applyFilter, 150);
      });
    }
    var clearBtn = document.getElementById('clearSearch');
    if (clearBtn) {
      clearBtn.addEventListener('click', function () {
        var s = document.getElementById('search');
        if (s) s.value = '';
        applyFilter();
      });
    }
  }

  function applyFilter() {
    var search = document.getElementById('search');
    var text = search ? search.value.trim().toLowerCase() : '';

    filtered = items.slice();
    if (text) {
      filtered = filtered.filter(function (i) { return (i.title || '').toLowerCase().indexOf(text) !== -1; });
    }
    page = 1;
    render();
  }

  function goToPage(number, totalPages) {
    if (number < 1 || number > totalPages || number === page) return;
    page = number;
    render();
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

  function render() {
    var grid = document.getElementById('postGrid');
    var empty = document.getElementById('emptyState');
    var loading = document.getElementById('boardLoading');
    if (!grid) return;

    if (loading) loading.hidden = true;

    var totalPages = 1;
    if (!items.length) {
      grid.innerHTML = '<p class="board-loading">아직 수집된 링크가 없습니다. 다음 수집 주기에 갱신됩니다.</p>';
      if (empty) empty.hidden = true;
    } else if (!filtered.length) {
      grid.innerHTML = '';
      if (empty) empty.hidden = false;
    } else {
      if (empty) empty.hidden = true;
      totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
      page = Math.min(Math.max(1, page), totalPages);
      var start = (page - 1) * PAGE_SIZE;
      var slice = filtered.slice(start, start + PAGE_SIZE);
      var html = '';
      slice.forEach(function (it) { html += cardHtml(it); });
      grid.innerHTML = html;
    }

    renderPagination(filtered.length, totalPages);

    var countEl = document.getElementById('resultsCount');
    if (countEl) countEl.textContent = filtered.length + '건';
  }

  function cardHtml(it) {
    var author = it.author || it.source || '';
    var time = it.created_utc ? timeAgo(it.created_utc) : '시간 미상';
    if (it.posted_at) time = it.posted_at + ' · ' + time;
    return '<a class="model-card comm-card" href="' + esc(it.url) + '" target="_blank" rel="noopener nofollow">'
      + '<p class="category-label">19+</p>'
      + '<h3>' + esc(it.title) + '<small>' + esc(author) + '</small></h3>'
      + '<div class="card-footer">'
        + '<span class="comm-source">' + esc(it.source) + '</span>'
        + '<span class="recommend-count">' + esc(time) + '</span>'
        + '<span class="card-detail-link">원문으로 →</span>'
      + '</div>'
    + '</a>';
  }

  function timeAgo(unix) {
    if (!unix) return '시간 미상';
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

  function esc(str) {
    if (str == null) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();