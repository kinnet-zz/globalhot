#!/usr/bin/env python3
"""
Global Hot Reads — Auto Publisher
Generates article via AI API, creates HTML, updates archive/sitemap/nav.
Runs Mon/Wed/Fri via GitHub Actions.
"""

import os, sys, json, re, random, html as h
from datetime import datetime, date
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import URLError

PROJECT_ROOT = Path(__file__).resolve().parent.parent
POSTS_DIR = PROJECT_ROOT / "posts"
ARCHIVE_HTML = POSTS_DIR / "index.html"
SITEMAP_XML = PROJECT_ROOT / "sitemap.xml"
INDEX_HTML = PROJECT_ROOT / "index.html"

CATEGORIES = [
    ("기술", ["AI", "반도체", "클라우드", "사이버보안", "자율주행", "우주"]),
    ("비즈니스", ["전기차", "핀테크", "M&A", "공급망", "플랫폼", "커머스", "OTT"]),
    ("문화", ["K-콘텐츠", "게임", "음악", "SNS", "미디어", "예술"]),
    ("과학", ["기후", "생명공학", "에너지", "신소재", "로봇", "뇌과학"]),
]

def log(msg):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}")

def call_ai_api(prompt, system=None):
    openrouter_key = os.environ.get("OPENROUTER_API_KEY")
    gemini_key = os.environ.get("GEMINI_API_KEY2")
    openai_key = os.environ.get("OPENAI_API_KEY")

    if openrouter_key:
        return call_openrouter(openrouter_key, prompt, system)
    if gemini_key:
        return call_gemini(gemini_key, prompt, system)
    if openai_key:
        return call_openai(openai_key, prompt, system)

    log("ERROR: No API key set (OPENROUTER_API_KEY, GEMINI_API_KEY2, or OPENAI_API_KEY)")
    return None

def call_openrouter(api_key, prompt, system=None):
    models = ["openai/gpt-4o-mini", "google/gemini-2.0-flash-001", "mistralai/mistral-small-3.1-24b-instruct"]
    last_err = None
    for model in models:
        try:
            body = {
                "model": model,
                "messages": [
                    {"role": "system", "content": system or "You are a professional news curator writing in Korean."},
                    {"role": "user", "content": prompt},
                ],
                "temperature": 0.7, "max_tokens": 3000,
            }
            req = Request("https://openrouter.ai/api/v1/chat/completions",
                data=json.dumps(body).encode(),
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json",
                         "HTTP-Referer": "https://globalhot.net", "X-Title": "GlobalHot"})
            resp = json.loads(urlopen(req, timeout=120).read())
            return resp["choices"][0]["message"]["content"]
        except Exception as e:
            last_err = e
            log(f"OpenRouter {model}: {e}")
    log(f"OpenRouter API failed: {last_err}")
    return None

def call_gemini(api_key, prompt, system=None):
    import time as _time
    last_err = None
    model = "gemini-2.0-flash"
    for attempt in range(6):
        try:
            body = {
                "contents": [{"role": "user", "parts": [{"text": prompt}]}],
                "generationConfig": {"temperature": 0.7, "maxOutputTokens": 3000},
            }
            if system:
                body["systemInstruction"] = {"parts": [{"text": system}]}
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
            req = Request(url, data=json.dumps(body).encode(), headers={"Content-Type": "application/json"})
            resp = json.loads(urlopen(req, timeout=120).read())
            if "candidates" in resp and resp["candidates"]:
                return resp["candidates"][0]["content"]["parts"][0]["text"]
            log(f"Gemini {model}: empty response")
            break
        except Exception as e:
            last_err = e
            code = getattr(e, "code", 0) if hasattr(e, "code") else 0
            if code == 429:
                delay = 30 * (attempt + 1)
                log(f"Gemini {model}: rate limited, waiting {delay}s...")
                _time.sleep(delay)
                continue
            log(f"Gemini {model}: {e}")
            break
    if last_err:
        log(f"Gemini API error: {last_err}")
    return None

def call_openai(api_key, prompt, system=None):
    model = os.environ.get("AI_MODEL", "gpt-4o-mini")
    body = json.dumps({
        "model": model,
        "messages": [
            {"role": "system", "content": system or "You are a professional news curator writing in Korean."},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.7,
        "max_tokens": 3000,
    }).encode()
    req = Request("https://api.openai.com/v1/chat/completions", data=body, headers={
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    })
    try:
        resp = json.loads(urlopen(req, timeout=120).read())
        return resp["choices"][0]["message"]["content"]
    except Exception as e:
        log(f"OpenAI API error: {e}")
        return None

def pick_topic():
    all_topics = []
    for cat, subs in CATEGORIES:
        for sub in subs:
            all_topics.append((cat, sub))
    idx = hash(date.today().isoformat()) % len(all_topics)
    return all_topics[idx]

def generate_article(category, subtopic):
    system = (
        "You are a professional journalist and curator for 'Global Hot Reads', "
        "a Korean-language curation site that picks notable articles from global media. "
        "Write in Korean. Return ONLY valid JSON with no markdown fences."
    )
    prompt = f"""
Generate a curation article about "{subtopic}" in the "{category}" category for Global Hot Reads.

Return JSON with these fields:
- "category": "{category} · {subtopic}" (e.g. "기술 · AI")
- "title": compelling Korean title (25-45 chars)
- "subtitle": one-sentence description (50-90 chars)
- "sections": array of section objects, each with:
  - "heading": section heading (string)
  - "type": "text" | "quote" | "list"
  - "body": content string (for "quote", the quote text; for "list", comma-separated items)
- "tags": array of 4-5 Korean/English tag strings
- "summary": 1-2 sentence intro paragraph for the article body

Requirements:
- Total body length: 600-900 words
- Include 1 quote section (from a real or plausible expert/source)
- Include 1 list section (3-5 items)
- Every section must have Korean content
- The article should reference real 2026 trends and data
- Include a "한국에 주는 시사점" or similar Korea-relevant section
- Style: analytical but accessible, like The Atlantic or HBR in Korean
"""
    raw = call_ai_api(prompt, system)
    if raw:
        raw = raw.strip()
        if raw.startswith("```"):
            raw = re.sub(r'^```(json)?\s*', '', raw)
            raw = re.sub(r'\s*```$', '', raw)
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            log(f"JSON parse failed, raw: {raw[:200]}...")
    return None

def make_slug(title):
    s = title.lower()
    s = re.sub(r'[^a-z0-9가-힣\s-]', '', s)
    s = re.sub(r'[\s]+', '-', s.strip())
    s = re.sub(r'-+', '-', s)
    return s[:60]

def escape_html(s):
    return h.escape(str(s), quote=True)

def build_article_html(data, slug, pub_date):
    date_str = pub_date.strftime("%Y.%m.%d")
    date_iso = pub_date.isoformat()
    title = data["title"]
    category = data["category"]
    subtitle = data["subtitle"]
    tags = data.get("tags", [])
    sections = data.get("sections", [])
    summary = data.get("summary", "")

    body_parts = [f"<p>{escape_html(summary)}</p>"] if summary else []
    for sec in sections:
        stype = sec.get("type", "text")
        heading = sec.get("heading", "")
        body = sec.get("body", "")
        if heading:
            body_parts.append(f"<h2>{escape_html(heading)}</h2>")
        if stype == "quote":
            body_parts.append(f"<blockquote>{escape_html(body)}</blockquote>")
        elif stype == "list":
            items = [f"<li><strong>{escape_html(i.split('—')[0].strip())}:</strong> {'—'.join(i.split('—')[1:]).strip() if '—' in i else ''}" for i in body.split(",")]
            body_parts.append("<ul>" + "".join(items) + "</ul>")
        else:
            body_parts.append(f"<p>{escape_html(body)}</p>")

    tag_spans = "".join(f'<span class="post-tag">{escape_html(t)}</span>' for t in tags)
    body_html = "\n      ".join(body_parts)

    html = f"""<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <script src="/analytics.js?v=20260718-2"></script>
  <meta name="description" content="{escape_html(subtitle)}" />
  <title>{escape_html(title)} | Global Hot Reads</title>
  <link rel="canonical" href="https://globalhot.net/posts/{slug}.html" />
  <link rel="stylesheet" href="/style.css?v=20260718-4" />
  <style>
    .post-page {{ background:var(--bg); }}
    .post-wrap {{ max-width:740px; margin:0 auto; padding:48px 20px 80px; }}
    .post-meta {{ color:var(--text3); font-size:12px; margin-bottom:8px; }}
    .post-category {{ color:var(--accent); font-size:11px; font-weight:700; letter-spacing:1px; text-transform:uppercase; margin-bottom:10px; }}
    .post-wrap h1 {{ font-family:'Noto Serif KR',Georgia,serif; font-size:34px; line-height:1.35; letter-spacing:-0.3px; margin-bottom:14px; word-break:keep-all; }}
    .post-subtitle {{ color:var(--text2); font-size:16px; line-height:1.7; margin-bottom:32px; padding-bottom:24px; border-bottom:1px solid var(--border); }}
    .post-body {{ font-size:15.5px; line-height:1.95; color:var(--text); }}
    .post-body p {{ margin-bottom:18px; }}
    .post-body h2 {{ font-size:22px; font-weight:700; margin:40px 0 14px; }}
    .post-body h3 {{ font-size:17px; font-weight:700; margin:28px 0 10px; }}
    .post-body blockquote {{ border-left:3px solid var(--accent); padding:12px 18px; margin:20px 0; background:var(--card); border-radius:0 var(--radius-sm) var(--radius-sm) 0; color:var(--text2); font-style:italic; }}
    .post-body ul, .post-body ol {{ padding-left:20px; margin-bottom:18px; }}
    .post-body li {{ margin-bottom:8px; }}
    .post-body a {{ color:var(--accent); text-decoration:underline; }}
    .post-footer {{ margin-top:48px; padding-top:24px; border-top:1px solid var(--border); }}
    .post-tags {{ display:flex; gap:8px; flex-wrap:wrap; margin-bottom:16px; }}
    .post-tag {{ background:var(--bg3); color:var(--text2); font-size:11px; padding:4px 10px; border-radius:4px; }}
    .post-author {{ color:var(--text3); font-size:13px; line-height:1.7; }}
    .post-nav {{ display:flex; gap:16px; margin-top:32px; flex-wrap:wrap; }}
    .post-nav a {{ color:var(--accent); font-size:13px; font-weight:600; }}
    .disclaimer {{ margin-top:32px; padding:14px 18px; background:var(--card); border:1px solid var(--border); border-radius:var(--radius-sm); font-size:12px; color:var(--text3); line-height:1.7; }}
    @media (max-width:600px) {{ .post-wrap h1 {{ font-size:26px; }} .post-body {{ font-size:15px; }} }}
  </style>
</head>
<body class="post-page">
  <header class="header">
    <div class="header-inner">
      <a class="logo" href="/" aria-label="Global Hot Reads 홈">
        <span class="logo-text"><span>Global</span><strong>Hot Reads</strong></span>
        <span class="logo-badge">BETA</span>
      </a>
      <nav class="primary-nav" aria-label="주요 메뉴">
        <a href="/#latest">최신 글</a>
        <a href="/#curated">이 주의 큐레이션</a>
        <a href="/posts/">전체 글</a>
        <a href="/about.html">소개</a>
      </nav>
    </div>
  </header>

  <main class="post-wrap">
    <p class="post-category">{escape_html(category)}</p>
    <h1>{escape_html(title)}</h1>
    <p class="post-meta">{date_str} · 거리의악사</p>
    <p class="post-subtitle">{escape_html(subtitle)}</p>

    <div class="post-body">
      {body_html}
    </div>

    <div class="post-footer">
      <div class="post-tags">
        {tag_spans}
      </div>
      <p class="post-author">편집: 거리의악사</p>
    </div>

    <div class="post-nav" id="postNav">
      <a href="/posts/">← 전체 글 목록</a>
      <a href="/posts/">전체 글 목록 →</a>
    </div>

    <div class="disclaimer">이 글은 정보 제공 목적이며 특정 기술이나 서비스에 대한 추천이 아닙니다. 인용된 데이터와 통계는 각 출처의 저작물입니다.</div>
  </main>

  <footer class="site-footer" style="border-top:1px solid var(--border);padding:32px 20px;background:var(--bg2);">
    <div style="max-width:740px;margin:0 auto;">
      <p style="color:var(--text3);font-size:12px;">&copy; 2026 Global Hot Reads &middot; <a href="/privacy.html" style="color:var(--text3);">개인정보처리방침</a> &middot; <a href="/terms.html" style="color:var(--text3);">이용약관</a></p>
    </div>
  </footer>
</body>
</html>"""
    return html

def get_existing_articles():
    """Return sorted list of (date, slug, title, desc, tag) from archive."""
    articles = []
    pattern = re.compile(
        r'<time datetime="(\d{4}-\d{2}-\d{2})">.*?</time>\s*'
        r'<h2><a href="/posts/([^"]+)">(.*?)</a></h2>\s*'
        r'<p>(.*?)</p>\s*'
        r'<span class="archive-tag">(.*?)</span>',
        re.DOTALL
    )
    for m in pattern.finditer(ARCHIVE_HTML.read_text(encoding="utf-8")):
        articles.append({
            "date": m.group(1),
            "slug": m.group(2),
            "title": m.group(3).strip(),
            "desc": m.group(4).strip(),
            "tag": m.group(5).strip(),
        })
    return sorted(articles, key=lambda a: a["date"], reverse=True)

def update_archive_html(data, slug, pub_date):
    date_str = pub_date.strftime("%Y.%m.%d")
    date_iso = pub_date.isoformat()
    tag = data["category"]
    new_entry = f"""
    <article class="archive-item">
      <time datetime="{date_iso}">{date_str}</time>
      <h2><a href="/posts/{slug}.html">{escape_html(data['title'])}</a></h2>
      <p>{escape_html(data['subtitle'])}</p>
      <span class="archive-tag">{escape_html(tag)}</span>
    </article>"""

    content = ARCHIVE_HTML.read_text(encoding="utf-8")
    marker = r'(<main class="archive-wrap">.*?<p class="archive-lead">.*?</p>\s*)'
    m = re.search(marker, content, re.DOTALL)
    if m:
        insert_point = m.end()
        content = content[:insert_point] + new_entry + content[insert_point:]
        ARCHIVE_HTML.write_text(content, encoding="utf-8")
        log("Archive updated")
    else:
        log("ERROR: Could not find archive insert point")

def update_sitemap(slug, pub_date):
    date_iso = pub_date.isoformat()
    new_entry = f"""  <url>
    <loc>https://globalhot.net/posts/{slug}.html</loc>
    <lastmod>{date_iso}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.9</priority>
  </url>"""

    content = SITEMAP_XML.read_text(encoding="utf-8")
    # Insert before </urlset>
    content = content.replace("</urlset>", f"{new_entry}\n</urlset>")
    SITEMAP_XML.write_text(content, encoding="utf-8")
    log("Sitemap updated")

def update_nav_links(new_slug, pub_date):
    articles = get_existing_articles()
    if len(articles) < 2:
        return

    newest = articles[0]  # the article that was #1 before
    date_str = pub_date.strftime("%Y.%m.%d")

    # Update the new article's nav (in the HTML we just created)
    new_file = POSTS_DIR / f"{new_slug}.html"
    new_content = new_file.read_text(encoding="utf-8")
    prev_link = f'<a href="/posts/{newest["slug"]}">← 이전 글</a>'
    if len(articles) > 1:
        next_link = f'<a href="/posts/{articles[1]["slug"]}">다음 글 →</a>'
    else:
        next_link = '<a href="/posts/">전체 글 목록 →</a>'
    new_nav = f'    <div class="post-nav" id="postNav">\n      {prev_link}\n      {next_link}\n    </div>'
    new_content = re.sub(
        r'<div class="post-nav"[^>]*>.*?</div>',
        new_nav,
        new_content,
        flags=re.DOTALL
    )
    new_file.write_text(new_content, encoding="utf-8")
    log("New article nav links updated")

    # Update the previous newest article's "prev" link
    newest_file = POSTS_DIR / newest["slug"]
    if newest_file.exists():
        nc = newest_file.read_text(encoding="utf-8")
        # Its "전체 글 목록" prev link should point to us
        nc = nc.replace(
            '<a href="/posts/">← 전체 글 목록</a>',
            f'<a href="/posts/{new_slug}.html">← 이전 글</a>'
        )
        newest_file.write_text(nc, encoding="utf-8")
        log(f"Previous newest nav updated ({newest['slug']})")

def update_index_latest(slug, pub_date, data):
    """Update the '최신 큐레이션' section on index.html to show 3 most recent."""
    articles = get_existing_articles()
    if not articles:
        return

    # Build the grid HTML for top 3
    grid_items = []
    for i, a in enumerate(articles[:3]):
        a_date = datetime.strptime(a["date"], "%Y-%m-%d").strftime("%Y.%m.%d")
        # Determine category tag from archive tag
        cat_tag = a["tag"]
        # Create tag spans
        tag_parts = [t.strip() for t in cat_tag.split("·")]
        tag_spans = " ".join(
            f'<span style="background:var(--bg3);color:var(--text2);font-size:11px;padding:3px 8px;border-radius:4px;">{escape_html(t)}</span>'
            for t in tag_parts
        )
        item = f"""        <article style="background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:24px;transition:border-color .2s;">
          <p style="color:var(--text3);font-size:11px;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;margin-bottom:8px;">{escape_html(cat_tag)} · {a_date}</p>
          <h3 style="font-size:17px;font-weight:700;line-height:1.5;margin-bottom:10px;"><a href="/posts/{a['slug']}" style="color:var(--text);">{escape_html(a['title'])}</a></h3>
          <p style="color:var(--text2);font-size:13.5px;line-height:1.7;margin-bottom:12px;">{escape_html(a['desc'])}</p>
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
            {tag_spans}
          </div>
        </article>"""
        grid_items.append(item)

    grid_html = '\n'.join(grid_items)

    content = INDEX_HTML.read_text(encoding="utf-8")
    # Replace the analysis-grid section
    pattern = r'(<div class="analysis-grid[^>]*>)\s*.*?(?=</div>\s*</section>)'
    replacement = f'\\1\n{grid_html}\n      '
    new_content = re.sub(pattern, replacement, content, flags=re.DOTALL)
    if new_content != content:
        INDEX_HTML.write_text(new_content, encoding="utf-8")
        log("Index latest section updated")
    else:
        log("WARNING: Could not update index latest section (pattern mismatch)")

def main():
    log("=== Global Hot Reads Auto Publisher ===")
    pub_date = date.today()

    # 1. Pick topic
    topic = pick_topic()
    category, subtopic = topic
    log(f"Topic: {category} / {subtopic}")

    # 2. Generate article
    data = generate_article(category, subtopic)
    if not data:
        log("FATAL: Article generation failed")
        sys.exit(1)

    # Validate required fields
    for field in ["title", "category", "subtitle"]:
        if field not in data:
            log(f"FATAL: Missing field '{field}' in generated data")
            sys.exit(1)

    title = data["title"]
    slug = make_slug(title)
    # Ensure unique slug
    if (POSTS_DIR / f"{slug}.html").exists():
        slug = f"{slug}-{pub_date.strftime('%m%d')}"

    log(f"Title: {title}")
    log(f"Slug: {slug}")

    # 3. Generate HTML
    html = build_article_html(data, slug, pub_date)
    article_file = POSTS_DIR / f"{slug}.html"
    article_file.write_text(html, encoding="utf-8")
    log(f"Article created: {article_file.name}")

    # 4. Update archive
    update_archive_html(data, slug, pub_date)

    # 5. Update sitemap
    update_sitemap(slug, pub_date)

    # 6. Update nav links
    update_nav_links(slug, pub_date)

    # 7. Update index.html latest section
    update_index_latest(slug, pub_date, data)

    log("=== Done ===")

if __name__ == "__main__":
    main()
