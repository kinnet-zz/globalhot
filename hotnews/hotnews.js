// hotnews.js - Client-side filtering & sorting

(function() {
  'use strict';

  var posts = [];
  var filteredPosts = [];
  
  function init() {
    // Load posts from data attribute or inline JSON
    var dataEl = document.getElementById('hotnews-data');
    if (!dataEl) return;
    
    try {
      posts = JSON.parse(dataEl.textContent);
    } catch(e) {
      console.error('Failed to parse hotnews data:', e);
      return;
    }
    
    var params = getParams();
    applyFilters(params);
  }
  
  function getParams() {
    var params = {};
    var hash = window.location.hash.slice(1) || window.location.search.slice(1);
    if (!hash) return params;
    
    hash.split('&').forEach(function(pair) {
      var eq = pair.indexOf('=');
      if (eq > -1) {
        params[decodeURIComponent(pair.slice(0, eq))] = decodeURIComponent(pair.slice(eq + 1));
      }
    });
    return params;
  }
  
  function applyFilters(params) {
    var sub = params.sub || 'all';
    var sort = params.sort || 'score';
    var time = params.time || 'all';
    var thumb = params.thumb;
    var text = params.q || '';
    
    filteredPosts = posts.slice();
    
    // Filter by subreddit
    if (sub !== 'all') {
      filteredPosts = filteredPosts.filter(function(p) {
        return p.subreddit === sub;
      });
    }
    
    // Filter by time
    if (time !== 'all') {
      var now = Date.now();
      var cutoff = 0;
      switch(time) {
        case '3h': cutoff = 3 * 60 * 60 * 1000; break;
        case '6h': cutoff = 6 * 60 * 60 * 1000; break;
        case '12h': cutoff = 12 * 60 * 60 * 1000; break;
        case '24h': cutoff = 24 * 60 * 60 * 1000; break;
        case 'week': cutoff = 7 * 24 * 60 * 60 * 1000; break;
      }
      if (cutoff) {
        filteredPosts = filteredPosts.filter(function(p) {
          return (now - p.created_utc * 1000) < cutoff;
        });
      }
    }
    
    // Filter by search text
    if (text) {
      var lower = text.toLowerCase();
      filteredPosts = filteredPosts.filter(function(p) {
        return p.title.toLowerCase().indexOf(lower) !== -1;
      });
    }
    
    // Sort
    filteredPosts.sort(function(a, b) {
      switch(sort) {
        case 'score': return b.score - a.score;
        case 'comments': return b.num_comments - a.num_comments;
        case 'time': return b.created_utc - a.created_utc;
        case 'ups': return b.ups - a.ups;
        default: return b.score - a.score;
      }
    });
    
    renderPosts(filteredPosts, thumb === 'on');
    renderCount(filteredPosts.length);
    updateActiveStates(sub, sort, time, thumb);
  }
  
  function renderPosts(postsToRender, showThumb) {
    var tbody = document.getElementById('post-tbody');
    if (!tbody) return;
    
    if (!postsToRender.length) {
      tbody.innerHTML = '<tr><td colspan="3" class="empty">포스트가 없습니다</td></tr>';
      return;
    }
    
    var html = '';
    postsToRender.forEach(function(post, idx) {
      html += renderRow(idx + 1, post, showThumb);
    });
    tbody.innerHTML = html;
  }
  
  function renderRow(idx, post, showThumb) {
    var thumbHtml = showThumb && post.thumbnail && post.thumbnail !== 'self' 
      ? '<div class="thumb" style="background-image:url(\'' + escapeHtml(post.thumbnail) + '\')"></div>'
      : '';
    
    var flairHtml = post.flair 
      ? '<span class="flair">' + escapeHtml(post.flair) + '</span>'
      : '';
    
    var commentsHtml = post.num_comments > 0 
      ? '<span class="comments">(' + post.num_comments + ')</span>'
      : '';
    
    var timeHtml = timeAgo(post.created_utc);
    
    return '<tr class="post-row" data-id="' + escapeHtml(post.id) + '">'
      + '<td class="rank">' + idx + '</td>'
      + '<td class="content">'
        + thumbHtml
        + flairHtml
        + '<a class="title" href="' + escapeHtml(post.url) + '" target="_blank" rel="noopener">' + escapeHtml(post.title) + '</a>'
        + commentsHtml
      + '</td>'
      + '<td class="meta">'
        + '<div class="stats">'
          + '<span class="score">⬆' + formatNum(post.score) + '</span>'
          + '<span class="badge">' + escapeHtml(post.subreddit) + '</span>'
          + '<span class="time">' + timeHtml + '</span>'
        + '</div>'
        + '<div class="author">by ' + escapeHtml(post.author) + '</div>'
      + '</td>'
    + '</tr>';
  }
  
  function renderCount(count) {
    var el = document.getElementById('post-count');
    if (el) el.textContent = '총 ' + count + '개 포스트 수집됨';
  }
  
  function updateActiveStates(sub, sort, time, thumb) {
    // Update sidebar active states
    var subBtns = document.querySelectorAll('.sub-btn');
    subBtns.forEach(function(btn) {
      var s = btn.getAttribute('data-sub') || 'all';
      btn.className = 'sub-btn' + (s === sub ? ' on' : '');
    });
    
    var sortBtns = document.querySelectorAll('.sort-btn');
    sortBtns.forEach(function(btn) {
      var s = btn.getAttribute('data-sort') || 'score';
      btn.className = 'sort-btn' + (s === sort ? ' on' : '');
    });
    
    var timeBtns = document.querySelectorAll('.time-btn');
    timeBtns.forEach(function(btn) {
      var t = btn.getAttribute('data-time') || 'all';
      btn.className = 'time-btn' + (t === time ? ' on' : '');
    });
  }
  
  function timeAgo(timestamp) {
    var now = Date.now();
    var diff = now - timestamp * 1000;
    var mins = Math.floor(diff / 60000);
    if (mins < 60) return mins + '분전';
    var hours = Math.floor(mins / 60);
    if (hours < 24) return hours + '시간전';
    var days = Math.floor(hours / 24);
    if (days < 7) return days + '일전';
    return Math.floor(days / 7) + '주전';
  }
  
  function formatNum(n) {
    if (n >= 10000) return (n / 10000).toFixed(1) + '만';
    if (n >= 1000) return (n / 1000).toFixed(1) + '천';
    return String(n);
  }
  
  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  
  // Initialize on load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  
  // Handle popstate (back/forward)
  window.addEventListener('popstate', function() {
    var params = getParams();
    applyFilters(params);
  });
})();
