import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// Google News RSS queries — gravure/model/cosplay hot topics
const QUERIES = [
  { q: 'gravure idol japanese', label: 'gravure' },
  { q: 'gravure model 2026', label: 'gravure' },
  { q: 'cosplay popular 2026', label: 'cosplay' },
  { q: 'OnlyFans model popular', label: 'models' },
  { q: 'japanese idol photo book', label: 'idol' },
  { q: 'korean instagram model', label: 'models' },
  { q: '인스타 모델', label: 'models' },
];

// Domains to exclude (industrial gravure, irrelevant manufacturing)
const EXCLUDE_DOMAINS = ['packman.in', 'foodsspectrum.com', 'plastindia'];
// Titles that look like noise (manufacturing, conventions, generic news)
const EXCLUDE_KEYWORDS = [
  'printing', 'press', 'machine', 'flex', 'packaging', 'flexo',
  'comic-con', 'anime expo', 'comic con', 'comiccon', 'convention',
  'expo', 'festival', 'anime india', 'anime ottawa',
  'best cosplay', 'top cosplay', 'cosplay gallery', 'cosplay contest',
  'cosplay cup', 'cosplay summit', 'cosplay championship',
  'comicpalooza', 'wondercon', 'liverpool comic', 'c2e2', 'mcm birmingham',
  'evolution', 'gamestop', 'game awards', 'game awards',
  'meta instagram', 'meta starts', 'meta muse', 'algorithm',
  'virat kohli', 'kohli',
  'ai photos', 'ai fodder',
  'instagram premium', 'instagram business',
  'pokemon', 'pickleball',
];

// Must have at least one of these keywords to pass (content relevance)
const MUST_KEYWORDS = [
  'gravure', 'model', 'idol', 'gravura', '그라비아', '인스타',
  '모델', '아이돌', 'onlyfans', 'insta', '写真', 'グラビア',
  'sexy', 'bikini', 'swimsuit', 'glamour', 'cosplayer',
];

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function extractTag(xml, tag) {
  const match = xml.match(new RegExp(`<${tag}[^>]*>(.*?)<\\/${tag}>`, 'is'));
  return match ? match[1].replace(/<[^>]*>/g, '').trim() : '';
}

function parseRSS(xml, source) {
  const posts = [];
  const items = xml.match(/<item>([\s\S]*?)<\/item>/g) || [];

  for (const item of items) {
    const title = extractTag(item, 'title');
    const link = extractTag(item, 'link');
    const pubDate = extractTag(item, 'pubDate');
    const guid = extractTag(item, 'guid');
    const mediaContent = extractTag(item, 'media:content');
    const mediaThumbnail = extractTag(item, 'media:thumbnail');

    if (!title || !link) continue;

    // Extract source domain from link or title
    const domain = extractDomain(link);
    const sourceLabel = title.replace(/ - .+$/, '').replace(/ - .+$/, '') || source;

    // Skip manufacturing/industrial noise
    if (EXCLUDE_DOMAINS.some(d => link.includes(d))) continue;
    if (EXCLUDE_KEYWORDS.some(k => title.toLowerCase().includes(k))) continue;
    // Must have at least one relevance keyword
    const titleLower = title.toLowerCase();
    if (!MUST_KEYWORDS.some(k => titleLower.includes(k.toLowerCase()))) continue;

    // Extract thumbnail from media tag
    let thumbnail = '';
    if (mediaContent) {
      const urlMatch = mediaContent.match(/url="([^"]+)"/);
      if (urlMatch) thumbnail = urlMatch[1];
    } else if (mediaThumbnail) {
      const urlMatch = mediaThumbnail.match(/url="([^"]+)"/);
      if (urlMatch) thumbnail = urlMatch[1];
    }

    posts.push({
      title: cleanTitle(title),
      url: link,
      guid: guid || link,
      pubDate: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
      source: sourceLabel,
      domain: domain,
      thumbnail: thumbnail,
    });
  }

  return posts;
}

function extractDomain(url) {
  const match = url.match(/([^/]+)\.com/);
  return match ? match[1] : '';
}

function cleanTitle(title) {
  return title.trim();
}

async function scrapeQuery({ q, label }) {
  console.log(`  Searching: "${q}" [${label}]`);

  const urls = [
    `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&num=10&output=rss`,
    `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&num=10&hl=en&gl=US&ceid=US:en&output=rss`,
  ];

  for (const url of urls) {
    try {
      const resp = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT }
      });

      if (!resp.ok) {
        console.log(`    ✗ ${resp.status}`);
        continue;
      }

      const text = await resp.text();
      const posts = parseRSS(text, label);
      console.log(`    ✓ ${posts.length} posts`);
      return posts;
    } catch (e) {
      console.log(`    ✗ ${e.message}`);
    }
  }

  return [];
}

async function main() {
  console.log('══ Hot News Scraper (Google News RSS) ══\n');

  const allPosts = [];

  for (const query of QUERIES) {
    const posts = await scrapeQuery(query);
    allPosts.push(...posts);
    await sleep(800); // Rate limit
  }

  // Deduplicate by GUID (prefer longer/more recent)
  const seen = new Map();
  for (const p of allPosts) {
    const key = p.guid;
    if (!seen.has(key)) {
      seen.set(key, p);
    }
  }

  const unique = Array.from(seen.values());

  // Enrich with created_utc and scoring
  const enriched = unique.map((p, i) => {
    const date = new Date(p.pubDate);
    return {
      id: p.guid || `post_${i}`,
      source: p.source,
      title: p.title,
      url: p.url,
      domain: p.domain,
      thumbnail: p.thumbnail,
      created_utc: Math.floor(date.getTime() / 1000),
      score: 0, // No upvote system for RSS
      num_comments: 0,
      subreddit: p.source, // Reuse for UI compatibility
      author: p.domain || 'Google News',
      external_url: '',
      is_video: false,
      is_self: false,
      flair: p.domain ? p.domain.replace(/^(www\.)?/, '').split('.')[0] : '',
    };
  });

  // Sort by date (newest first)
  enriched.sort((a, b) => b.created_utc - a.created_utc);

  const output = {
    meta: {
      scraped_at: new Date().toISOString(),
      total_posts: enriched.length,
      queries: QUERIES.map(q => q.q),
      source: 'Google News RSS',
    },
    posts: enriched,
  };

  const outDir = join(import.meta.dirname, '..', 'data');
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, 'hotnews.json');
  writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf-8');

  console.log(`\n✓ Saved ${enriched.length} posts to data/hotnews.json`);
}

main().catch(err => {
  console.error('Scraper failed:', err);
  process.exit(1);
});
