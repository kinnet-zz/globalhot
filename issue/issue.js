// issue.js — 글로벌 이슈 수집기 클라이언트 필터/렌더 (링크 전용)

(function () {
  'use strict';

  var items = [];
  var filtered = [];
  var firstScrapedAt = 0;

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
    if (items.length) firstScrapedAt = items[0].created_utc || 0;
    buildSourceButtons();
    var params = getParams();
    // 검색창 반영
    var searchEl = document.getElementById('search');
    if (searchEl && params.q) searchEl.value = params.q;
    applyFilters(params);
    bindSearch();
  }

  function bindSearch() {
    var el = document.getElementById('search');
    if (!el) return;
    var timer;
    el.addEventListener('input', function () {
      clearTimeout(timer);
      var val = el.value;
      timer = setTimeout(function () {
        var params = getParams();
        params.q = val;
        applyFilters(params);
      }, 180);
    });
  }

  function buildSourceButtons() {
    var platforms = [];
    var seen = {};
    items.forEach(function (it) {
      if (!seen[it.platform]) {
        seen[it.platform] = true;
        platforms.push(it.platform);
      }
    });
    var list = document.getElementById('src-list');
    if (!list) return;
    var html = '<a href="#src=all" class="src-btn on" data-src="all">전체</a>';
    platforms.forEach(function (p) {
      html += '<a href="#src=' + escapeHtml(p) + '" class="src-btn" data-src="' + escapeHtml(p) + '">' + escapeHtml(p) + '</a>';
    });
    list.innerHTML = html;
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
    var src = params.src || 'all';
    var time = params.time || 'all';
    var sort = params.sort || 'time';
    var text = params.q || '';

    filtered = items.slice();

    if (cat !== 'all') {
      filtered = filtered.filter(function (i) { return i.category === cat; });
    }
    if (src !== 'all') {
      filtered = filtered.filter(function (i) { return i.platform === src; });
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
        if (a.platform !== b.platform) return a.platform.localeCompare(b.platform);
        return b.created_utc - a.created_utc;
      }
      return b.created_utc - a.created_utc;
    });

    renderPosts(filtered);
    renderCount(filtered.length);
    updateActive(cat, src, time, sort);
  }

  function renderPosts(list) {
    var tbody = document.getElementById('post-tbody');
    if (!tbody) return;
    if (!list.length) {
      tbody.innerHTML = '<tr><td colspan="3" class="empty">조건에 맞는 포스트가 없습니다</td></tr>';
      return;
    }
    var html = '';
    list.forEach(function (it, idx) {
      html += renderRow(idx + 1, it);
    });
    tbody.innerHTML = html;
  }

  function renderRow(idx, it) {
    var catClass = 'cat-' + (CAT_LABEL[it.category] ? it.category : 'other');
    var catLabel = CAT_LABEL[it.category] || it.category;
    var time = it.created_utc ? timeAgo(it.created_utc) : '시간 미상';
    return '<tr class="post-row">'
      + '<td class="rank">' + idx + '</td>'
      + '<td class="content">'
        + '<a class="title" href="' + escapeHtml(it.url) + '" target="_blank" rel="noopener nofollow">' + escapeHtml(it.title) + '</a>'
      + '</td>'
      + '<td class="meta">'
        + '<div class="stats">'
          + '<span class="badge cat ' + catClass + '">' + escapeHtml(catLabel) + '</span>'
          + '<span class="badge">' + escapeHtml(it.platform) + '</span>'
          + '<span class="time">' + time + '</span>'
        + '</div>'
        + '<div class="author">' + escapeHtml(it.author || '') + '</div>'
      + '</td>'
    + '</tr>';
  }

  function renderCount(count) {
    var el = document.getElementById('post-count');
    if (el) el.textContent = '총 ' + count + '건';
    var upd = document.getElementById('updated-info');
    if (upd && firstScrapedAt) upd.textContent = '수집 ' + timeAgo(firstScrapedAt) + '';
  }

  function updateActive(cat, src, time, sort) {
    [['cat', cat, 'cat-btn'], ['src', src, 'src-btn'], ['time', time, 'time-btn'], ['sort', sort, 'sort-btn']].forEach(function (tuple) {
      var attr = tuple[0], val = tuple[1], cls = tuple[2];
      document.querySelectorAll('.' + cls).forEach(function (btn) {
        var v = btn.getAttribute('data-' + attr) || 'all';
        btn.className = cls + (v === val ? ' on' : '');
      });
    });
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
  window.addEventListener('popstate', function () { applyFilters(getParams()); });
})();
