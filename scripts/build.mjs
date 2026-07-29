import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { articles } from "../content/articles.mjs";
import { site } from "../content/site.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const POSTS_DIR = join(ROOT, "posts");
const absolute = (path = "/") => `${site.url}${path}`;
const articleUrl = (article) => `/posts/${article.slug}.html`;

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeXml(value = "") {
  return escapeHtml(value);
}

function jsonLd(value) {
  return `<script type="application/ld+json">${JSON.stringify(value).replaceAll(
    "<",
    "\\u003c"
  )}</script>`;
}

function formatDate(value) {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "Asia/Seoul"
  }).format(new Date(`${value}T00:00:00+09:00`));
}

function pageHead({
  title,
  description,
  path,
  type = "website",
  image = site.image,
  robots = "index, follow",
  structuredData = []
}) {
  const canonical = absolute(path);
  const socialImage = absolute(image);
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="${escapeHtml(description)}">
  <meta name="robots" content="${escapeHtml(robots)}">
  <link rel="canonical" href="${canonical}">
  <meta property="og:locale" content="ko_KR">
  <meta property="og:site_name" content="${site.name}">
  <meta property="og:type" content="${type}">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${canonical}">
  <meta property="og:image" content="${socialImage}">
  <meta property="og:image:alt" content="GlobalHot 글로벌 기술·비즈니스 브리핑">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="twitter:image" content="${socialImage}">
  <meta name="theme-color" content="#ffffff">
  <title>${escapeHtml(title)}</title>
  <link rel="stylesheet" href="/style.css?v=20260729">
${structuredData.length ? `  ${structuredData.map(jsonLd).join("\n  ")}` : ""}
</head>`;
}

function siteHeader(active = "") {
  const links = [
    ["/posts/", "브리핑", "posts"],
    ["/standards.html", "자료 기준", "standards"],
    ["/about.html", "소개", "about"]
  ];
  return `<header class="site-header">
  <div class="header-inner">
    <a class="brand" href="/" aria-label="GlobalHot 홈">
      <span class="brand-global">Global</span><strong>Hot</strong>
      <span class="brand-note">원문 해설</span>
    </a>
    <nav class="primary-nav" aria-label="주요 메뉴">
      ${links
        .map(
          ([href, label, key]) =>
            `<a href="${href}"${active === key ? ' aria-current="page"' : ""}>${label}</a>`
        )
        .join("")}
    </nav>
  </div>
</header>`;
}

function siteFooter() {
  return `<footer class="site-footer">
  <div class="footer-main">
    <div>
      <a class="brand brand-footer" href="/"><span class="brand-global">Global</span><strong>Hot</strong></a>
      <p>글로벌 기술·비즈니스 이슈를 공식 원문과 공개 데이터로 확인해 설명합니다.</p>
    </div>
    <nav aria-label="하단 메뉴">
      <a href="/posts/">전체 브리핑</a>
      <a href="/about.html">소개</a>
      <a href="/standards.html">자료 기준</a>
      <a href="/contact.html">문의·정정</a>
      <a href="/privacy.html">개인정보처리방침</a>
      <a href="/terms.html">이용약관</a>
      <a href="/feed.xml">RSS</a>
    </nav>
  </div>
  <div class="footer-legal">
    <p>© 2026 GlobalHot. 인용 자료의 저작권은 각 원저작자에게 있습니다.</p>
    <p>정보 제공 목적이며 투자·법률·의료 자문이 아닙니다.</p>
  </div>
</footer>`;
}

function layout({
  title,
  description,
  path,
  active,
  content,
  type,
  image,
  robots,
  structuredData = []
}) {
  return `${pageHead({
    title,
    description,
    path,
    type,
    image,
    robots,
    structuredData
  })}
<body>
${siteHeader(active)}
${content}
${siteFooter()}
</body>
</html>
`;
}

function articleCard(article, size = "standard") {
  return `<article class="article-card article-card-${size}">
${article.image && size === "lead"
  ? `  <a class="card-image" href="${articleUrl(article)}"><img src="${article.image}" alt="${escapeHtml(
      article.imageAlt
    )}" width="1600" height="900"></a>`
  : ""}
  <div class="card-body">
    <p class="card-meta"><span>${escapeHtml(article.category)}</span><time datetime="${
      article.updated
    }">${formatDate(article.updated)}</time></p>
    <h3><a href="${articleUrl(article)}">${escapeHtml(article.title)}</a></h3>
    <p>${escapeHtml(article.summary)}</p>
    <div class="card-foot">
      <span>원문 ${article.sources.length}개</span>
      <span>${article.readingMinutes}분</span>
    </div>
  </div>
</article>`;
}

function renderHome() {
  const [lead, ...rest] = articles;
  const websiteSchema = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: site.name,
    url: site.url,
    inLanguage: site.language,
    description: site.description,
    publisher: {
      "@type": "Organization",
      name: site.name,
      url: site.url
    }
  };
  const organizationSchema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: site.name,
    url: site.url,
    email: site.email
  };
  const content = `<main>
  <section class="home-hero">
    <img src="${site.image}" alt="" width="1600" height="900" aria-hidden="true">
    <div class="hero-shade"></div>
    <div class="hero-inner">
      <p class="hero-kicker">Evidence-first tech briefing</p>
      <h1>GlobalHot</h1>
      <p class="hero-copy">글로벌 기술·비즈니스 뉴스를 그대로 옮기지 않습니다.<br>공식 원문을 확인하고, 숫자의 조건과 한국에 미칠 영향을 설명합니다.</p>
      <a class="hero-link" href="${articleUrl(lead)}">최신 브리핑 읽기 <span aria-hidden="true">→</span></a>
    </div>
  </section>

  <section class="home-latest section-shell" aria-labelledby="latest-title">
    <header class="section-header">
      <div>
        <p class="section-kicker">Latest briefing</p>
        <h2 id="latest-title">지금 확인할 이슈</h2>
      </div>
      <a href="/posts/">전체 브리핑 <span aria-hidden="true">→</span></a>
    </header>
    <div class="lead-grid">
      ${articleCard(lead, "lead")}
      <div class="side-list">
        ${rest.slice(0, 3).map((article) => articleCard(article, "compact")).join("")}
      </div>
    </div>
  </section>

  <section class="signal-band" aria-labelledby="signal-title">
    <div class="section-shell signal-inner">
      <div>
        <p class="section-kicker">How to read</p>
        <h2 id="signal-title">제목보다 조건을 읽습니다</h2>
      </div>
      <dl class="signal-list">
        <div><dt>사실</dt><dd>공식 발표·법령·공시에서 확인된 내용</dd></div>
        <div><dt>한계</dt><dd>수치가 적용되는 범위와 아직 모르는 부분</dd></div>
        <div><dt>해석</dt><dd>한국 독자와 기업이 실제로 볼 지점</dd></div>
      </dl>
    </div>
  </section>

  <section class="section-shell home-library" aria-labelledby="library-title">
    <header class="section-header">
      <div>
        <p class="section-kicker">Reference library</p>
        <h2 id="library-title">두고 보는 기본 해설</h2>
      </div>
    </header>
    <div class="article-grid">
      ${rest.slice(3).map((article) => articleCard(article)).join("")}
    </div>
  </section>

  <section class="home-subscribe">
    <div class="section-shell subscribe-inner">
      <div>
        <p class="section-kicker">Twice a week</p>
        <h2>새 글은 주 2회, RSS로 바로 확인하세요</h2>
        <p>속보 경쟁 대신 원문을 읽고 확인할 시간을 확보합니다.</p>
      </div>
      <a class="text-command" href="/feed.xml">RSS 구독 <span aria-hidden="true">→</span></a>
    </div>
  </section>
</main>`;
  return layout({
    title: "GlobalHot | 글로벌 기술·비즈니스 원문 해설",
    description: site.description,
    path: "/",
    content,
    structuredData: [websiteSchema, organizationSchema]
  });
}

function renderArchive() {
  const schema = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "GlobalHot 전체 브리핑",
    url: absolute("/posts/"),
    inLanguage: site.language,
    hasPart: articles.map((article) => ({
      "@type": "Article",
      headline: article.title,
      url: absolute(articleUrl(article))
    }))
  };
  const content = `<main class="archive-page section-shell">
  <header class="page-intro">
    <p class="section-kicker">All briefings</p>
    <h1>전체 브리핑</h1>
    <p>AI·소프트웨어, 정책, 로봇, 배터리, 기업 공시를 공식 원문과 함께 읽습니다.</p>
  </header>
  <div class="archive-list">
    ${articles
      .map(
        (article) => `<article class="archive-row">
      <div class="archive-meta">
        <span>${escapeHtml(article.category)}</span>
        <time datetime="${article.updated}">${formatDate(article.updated)}</time>
      </div>
      <div>
        <h2><a href="${articleUrl(article)}">${escapeHtml(article.title)}</a></h2>
        <p>${escapeHtml(article.summary)}</p>
        <div class="card-foot"><span>원문 ${article.sources.length}개</span><span>${
          article.readingMinutes
        }분</span></div>
      </div>
    </article>`
      )
      .join("")}
  </div>
</main>`;
  return layout({
    title: "전체 브리핑 | GlobalHot",
    description: "GlobalHot이 공식 원문과 공개 데이터로 확인한 기술·비즈니스 브리핑 전체 목록.",
    path: "/posts/",
    active: "posts",
    content,
    structuredData: [schema]
  });
}

function renderArticle(article) {
  const image = article.image || site.image;
  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "Article",
    mainEntityOfPage: absolute(articleUrl(article)),
    headline: article.title,
    description: article.summary,
    image: [absolute(image)],
    datePublished: article.published,
    dateModified: article.updated,
    inLanguage: site.language,
    author: {
      "@type": "Person",
      name: site.author,
      url: absolute("/about.html#author")
    },
    publisher: {
      "@type": "Organization",
      name: site.name,
      url: site.url
    },
    citation: article.sources.map((source) => source.url)
  };
  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "홈", item: site.url },
      { "@type": "ListItem", position: 2, name: "브리핑", item: absolute("/posts/") },
      {
        "@type": "ListItem",
        position: 3,
        name: article.title,
        item: absolute(articleUrl(article))
      }
    ]
  };
  const content = `<main class="article-page">
  <article>
    <header class="article-header">
      <a class="article-back" href="/posts/">전체 브리핑</a>
      <p class="article-eyebrow">${escapeHtml(article.eyebrow)} · ${escapeHtml(
        article.category
      )}</p>
      <h1>${escapeHtml(article.title)}</h1>
      <p class="article-dek">${escapeHtml(article.summary)}</p>
      <div class="article-byline">
        <span>글 ${site.author}</span>
        <time datetime="${article.updated}">확인 ${formatDate(article.updated)}</time>
        <span>${article.readingMinutes}분</span>
        <span>원문 ${article.sources.length}개</span>
      </div>
    </header>
${article.image
  ? `    <figure class="article-hero-image"><img src="${article.image}" alt="${escapeHtml(
      article.imageAlt
    )}" width="1600" height="900"><figcaption>주제를 설명하기 위한 GlobalHot 편집 이미지</figcaption></figure>`
  : ""}
    <div class="article-layout">
      <aside class="article-summary" aria-label="핵심 요약">
        <p>핵심 요약</p>
        <ul>${article.takeaways.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
      </aside>
      <div class="article-body">
        <p class="article-intro">${escapeHtml(article.intro)}</p>
        ${article.sections
          .map(
            (section) => `<section>
          <h2>${escapeHtml(section.heading)}</h2>
          ${(section.paragraphs || []).map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("")}
${section.bullets
  ? `          <ul>${section.bullets.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
  : ""}
        </section>`
          )
          .join("")}
${article.disclaimer
  ? `        <p class="article-disclaimer">${escapeHtml(article.disclaimer)}</p>`
  : ""}
        <section class="source-section" aria-labelledby="sources-title">
          <div class="source-heading">
            <div>
              <p class="section-kicker">Primary sources</p>
              <h2 id="sources-title">확인한 원문</h2>
            </div>
            <p>모든 링크 확인일: ${formatDate(article.updated)}</p>
          </div>
          <ol class="source-list">
            ${article.sources
              .map(
                (source) => `<li>
              <p class="source-publisher">${escapeHtml(source.publisher)}</p>
              <a href="${source.url}" target="_blank" rel="noopener noreferrer">${escapeHtml(
                  source.title
                )} <span aria-hidden="true">↗</span></a>
              <p>${escapeHtml(source.note)}</p>
            </li>`
              )
              .join("")}
          </ol>
        </section>
        <footer class="article-end">
          <p><strong>${site.author}</strong> · GlobalHot 운영자. 기술 발표와 공시를 한국 독자가 확인할 수 있는 언어로 설명합니다.</p>
          <p>오류나 오래된 링크를 발견하면 <a href="/contact.html">정정 요청</a>을 보내주세요.</p>
        </footer>
      </div>
    </div>
  </article>
</main>`;
  return layout({
    title: `${article.title} | GlobalHot`,
    description: article.summary,
    path: articleUrl(article),
    active: "posts",
    content,
    type: "article",
    image,
    structuredData: [articleSchema, breadcrumbSchema]
  });
}

function renderAbout() {
  const content = `<main class="prose-page section-shell">
  <header class="page-intro page-intro-wide">
    <p class="section-kicker">About GlobalHot</p>
    <h1>세계의 기술 변화가<br>한국의 일과 산업에 닿는 지점을 봅니다</h1>
    <p>GlobalHot은 해외 기사를 번역해 쌓는 사이트가 아닙니다. 공식 발표, 법령, 공시, 연구 자료를 직접 연결하고 숫자가 성립하는 조건과 아직 확인되지 않은 부분을 함께 설명합니다.</p>
  </header>
  <section class="prose-section">
    <h2>다루는 범위</h2>
    <div class="topic-lines">
      <div><strong>AI와 소프트웨어</strong><p>제품 발표보다 실제 도입 조건, 생산성 근거, 안전과 비용을 봅니다.</p></div>
      <div><strong>기술 정책</strong><p>규제 원문과 시행 일정을 확인해 기업과 이용자에게 달라지는 점을 설명합니다.</p></div>
      <div><strong>산업 기술</strong><p>로봇·반도체·배터리의 성능 수치와 양산·공급망 조건을 구분합니다.</p></div>
      <div><strong>기업 공시</strong><p>보도자료의 주장과 공시 숫자를 대조하고 투자 판단을 대신하지 않습니다.</p></div>
    </div>
  </section>
  <section class="prose-section" id="author">
    <p class="section-kicker">Author</p>
    <h2>거리의악사</h2>
    <p>GlobalHot을 운영하고 모든 글을 작성·수정하는 필명입니다. 금융투자 전문가나 법률가를 자칭하지 않습니다. 공개된 1차 자료를 읽고 서로 다른 자료의 범위와 한계를 비교하는 데 집중합니다.</p>
    <p>사실 오류, 번역 오류, 깨진 링크는 확인 후 본문과 수정일에 반영합니다. 연락처는 <a href="mailto:${
      site.email
    }">${site.email}</a>입니다.</p>
  </section>
  <section class="prose-section prose-callout">
    <h2>새 글은 주 2회</h2>
    <p>속도를 위해 출처 확인을 생략하지 않습니다. 업데이트는 <a href="/feed.xml">RSS</a>와 <a href="/posts/">전체 브리핑</a>에서 확인할 수 있습니다.</p>
  </section>
</main>`;
  const schema = {
    "@context": "https://schema.org",
    "@type": "AboutPage",
    name: "GlobalHot 소개",
    url: absolute("/about.html"),
    author: { "@type": "Person", name: site.author },
    publisher: { "@type": "Organization", name: site.name, url: site.url }
  };
  return layout({
    title: "소개 | GlobalHot",
    description: "GlobalHot의 주제, 운영자 거리의악사, 독자에게 제공하려는 가치.",
    path: "/about.html",
    active: "about",
    content,
    structuredData: [schema]
  });
}

function renderStandards() {
  const content = `<main class="prose-page section-shell">
  <header class="page-intro">
    <p class="section-kicker">Source standards</p>
    <h1>자료 확인 기준</h1>
    <p>독자가 기사 속 숫자와 주장을 직접 확인할 수 있도록 다음 기준을 적용합니다.</p>
  </header>
  <section class="prose-section numbered-sections">
    <div><span>01</span><h2>1차 자료를 먼저 봅니다</h2><p>법령, 규제기관 문서, 기업 공시, 연구 원문, 공식 기술 문서를 우선합니다. 보도기사는 맥락을 찾는 데 활용하되 핵심 수치의 최종 근거로 대신하지 않습니다.</p></div>
    <div><span>02</span><h2>사실과 해석을 구분합니다</h2><p>자료에서 확인되는 내용과 GlobalHot의 해석을 문단에서 구분합니다. 확인되지 않은 전망을 확정된 일정처럼 쓰지 않습니다.</p></div>
    <div><span>03</span><h2>직접 인용은 원문이 있을 때만 씁니다</h2><p>발언 원문과 문맥을 확인할 수 없는 인용문은 사용하지 않습니다. 번역 인용은 의미를 바꾸지 않는 범위에서 최소화합니다.</p></div>
    <div><span>04</span><h2>숫자에는 범위와 기준 시점을 붙입니다</h2><p>셀과 팩, 출하와 판매, 설문과 실제 측정처럼 혼동하기 쉬운 정의를 확인합니다. 오래된 연구는 현재 제품의 성능처럼 표현하지 않습니다.</p></div>
    <div><span>05</span><h2>원문 링크와 확인일을 공개합니다</h2><p>핵심 판단에 사용한 원문은 기사 아래에 출처명, 문서 제목, 확인일과 함께 연결합니다. 링크가 변경되거나 자료가 갱신되면 확인일과 설명을 함께 고칩니다.</p></div>
  </section>
  <section class="prose-section correction-policy">
    <h2>정정 원칙</h2>
    <p>사실 오류는 확인 즉시 수정하고 기사 상단의 확인일을 갱신합니다. 글의 결론이 달라질 정도의 수정은 본문에 정정 내용을 표시합니다. 정정 요청은 <a href="/contact.html">문의 페이지</a>에서 받습니다.</p>
  </section>
</main>`;
  return layout({
    title: "자료 확인 기준 | GlobalHot",
    description: "GlobalHot이 출처, 수치, 인용, 자동화, 정정을 다루는 기준.",
    path: "/standards.html",
    active: "standards",
    content
  });
}

function renderContact() {
  const content = `<main class="prose-page section-shell">
  <header class="page-intro">
    <p class="section-kicker">Contact</p>
    <h1>문의·정정 요청</h1>
    <p>사실 오류, 번역 오류, 깨진 링크, 다뤘으면 하는 공식 자료를 알려주세요.</p>
  </header>
  <section class="contact-panel">
    <div>
      <h2>이메일</h2>
      <a href="mailto:${site.email}">${site.email}</a>
    </div>
    <div>
      <h2>정정 요청에 포함할 내용</h2>
      <ul>
        <li>해당 글의 URL과 문제가 있는 문장</li>
        <li>확인 가능한 원문 또는 공식 자료 URL</li>
        <li>회신이 필요한 경우 연락 가능한 이메일</li>
      </ul>
    </div>
  </section>
  <p class="contact-note">광고·제휴 제안은 콘텐츠의 결론이나 출처 선정에 영향을 줄 수 없으며, 유료 협업은 명확히 표시합니다.</p>
</main>`;
  return layout({
    title: "문의·정정 요청 | GlobalHot",
    description: "GlobalHot 문의, 오류 제보, 정정 요청 연락처.",
    path: "/contact.html",
    content
  });
}

function renderPrivacy() {
  const content = `<main class="policy-page section-shell">
  <header class="page-intro">
    <p class="section-kicker">Privacy</p>
    <h1>개인정보처리방침</h1>
    <p>최종 업데이트: 2026년 7월 29일</p>
  </header>
  <section><h2>1. 운영자</h2><p>GlobalHot 운영자: 거리의악사 · 문의: <a href="mailto:${site.email}">${
    site.email
  }</a></p></section>
  <section><h2>2. 직접 수집하는 정보</h2><p>회원가입, 댓글, 뉴스레터 신청 기능을 운영하지 않으며 사이트 안에서 이름·전화번호·주소를 직접 수집하지 않습니다. 이메일로 문의하면 발신 주소와 문의 내용이 답변을 위해 처리됩니다.</p></section>
  <section><h2>3. 서버 로그</h2><p>호스팅 제공자인 Cloudflare는 보안과 서비스 제공을 위해 IP 주소, 요청 시간, 브라우저 정보 같은 접속 로그를 처리할 수 있습니다. 관련 처리는 Cloudflare의 개인정보 보호정책을 따릅니다.</p></section>
  <section><h2>4. 쿠키와 분석</h2><p>현재 GlobalHot은 방문 분석을 위한 자체 쿠키를 설정하지 않습니다. 향후 분석 또는 광고 기능을 추가하면 적용 전에 이 방침과 동의 절차를 갱신합니다.</p></section>
  <section><h2>5. Google 광고</h2><p>Google AdSense 광고가 게재되는 경우 Google과 파트너는 광고 제공, 빈도 제한, 부정행위 방지를 위해 쿠키 또는 유사 기술을 사용할 수 있습니다. 필요한 지역에는 Google이 인증한 동의 관리 플랫폼을 적용하고 선택권을 제공합니다.</p></section>
  <section><h2>6. 외부 링크</h2><p>기사의 출처 링크를 열면 해당 외부 사이트의 개인정보처리방침이 적용됩니다. GlobalHot은 외부 사이트의 데이터 처리 방식을 통제하지 않습니다.</p></section>
  <section><h2>7. 문의와 변경</h2><p>개인정보 관련 문의는 ${site.email}로 보내주세요. 처리 방식이 달라지면 이 페이지의 업데이트 날짜와 내용을 수정합니다.</p></section>
</main>`;
  return layout({
    title: "개인정보처리방침 | GlobalHot",
    description: "GlobalHot의 개인정보, 서버 로그, 쿠키, 광고 관련 처리 방침.",
    path: "/privacy.html",
    content
  });
}

function renderTerms() {
  const content = `<main class="policy-page section-shell">
  <header class="page-intro">
    <p class="section-kicker">Terms</p>
    <h1>이용약관</h1>
    <p>최종 업데이트: 2026년 7월 29일</p>
  </header>
  <section><h2>1. 서비스 목적</h2><p>GlobalHot은 글로벌 기술·비즈니스 자료를 한국어로 설명하는 정보 서비스입니다. 특정 제품, 기업, 증권의 구매·판매를 권유하지 않습니다.</p></section>
  <section><h2>2. 정확성과 최신성</h2><p>공개 시점에 확인 가능한 원문을 바탕으로 작성하지만 모든 정보의 완전성이나 향후 유효성을 보장하지 않습니다. 중요한 결정은 연결된 원문과 해당 분야 전문가의 조언을 함께 확인해야 합니다.</p></section>
  <section><h2>3. 저작권</h2><p>GlobalHot이 작성한 해설의 저작권은 GlobalHot에 있습니다. 출처로 연결한 문서, 상표, 이미지의 권리는 각 권리자에게 있습니다. 합리적인 인용을 넘어선 무단 복제와 재배포를 금합니다.</p></section>
  <section><h2>4. 외부 링크</h2><p>외부 링크는 근거 확인과 추가 읽기를 위해 제공합니다. 외부 사이트의 내용, 가용성, 상품 또는 서비스에 대해 GlobalHot이 보증하지 않습니다.</p></section>
  <section><h2>5. 광고와 협업</h2><p>광고나 유료 협업이 있는 콘텐츠는 독자가 알 수 있도록 표시합니다. 광고주는 일반 편집 콘텐츠의 결론과 출처를 결정할 수 없습니다.</p></section>
  <section><h2>6. 문의</h2><p>약관과 콘텐츠 이용 문의: <a href="mailto:${site.email}">${
    site.email
  }</a></p></section>
</main>`;
  return layout({
    title: "이용약관 | GlobalHot",
    description: "GlobalHot 서비스 목적, 정확성, 저작권, 외부 링크와 광고 관련 이용 조건.",
    path: "/terms.html",
    content
  });
}

function render404() {
  const content = `<main class="not-found section-shell">
  <p class="section-kicker">404</p>
  <h1>페이지를 찾을 수 없습니다</h1>
  <p>주소가 바뀌었거나 검증되지 않은 이전 글이 정리됐을 수 있습니다.</p>
  <div><a href="/">홈으로</a><a href="/posts/">전체 브리핑</a></div>
</main>`;
  return layout({
    title: "페이지를 찾을 수 없습니다 | GlobalHot",
    description: "요청한 GlobalHot 페이지를 찾을 수 없습니다.",
    path: "/404.html",
    robots: "noindex, follow",
    content
  });
}

function renderSitemap() {
  const pages = [
    ["/", site.buildDate],
    ["/posts/", site.buildDate],
    ["/about.html", site.buildDate],
    ["/standards.html", site.buildDate],
    ["/contact.html", site.buildDate],
    ["/privacy.html", site.buildDate],
    ["/terms.html", site.buildDate],
    ...articles.map((article) => [articleUrl(article), article.updated])
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages
  .map(
    ([path, lastmod]) => `  <url>
    <loc>${escapeXml(absolute(path))}</loc>
    <lastmod>${lastmod}</lastmod>
  </url>`
  )
  .join("\n")}
</urlset>
`;
}

function renderFeed() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>GlobalHot</title>
    <link>${site.url}/</link>
    <description>${escapeXml(site.description)}</description>
    <language>ko-KR</language>
    <lastBuildDate>${new Date(`${site.buildDate}T12:00:00+09:00`).toUTCString()}</lastBuildDate>
    <atom:link href="${site.url}/feed.xml" rel="self" type="application/rss+xml"/>
${articles
  .map(
    (article) => `    <item>
      <title>${escapeXml(article.title)}</title>
      <link>${absolute(articleUrl(article))}</link>
      <guid isPermaLink="true">${absolute(articleUrl(article))}</guid>
      <pubDate>${new Date(`${article.published}T09:00:00+09:00`).toUTCString()}</pubDate>
      <description>${escapeXml(article.summary)}</description>
    </item>`
  )
  .join("\n")}
  </channel>
</rss>
`;
}

async function write(relativePath, content) {
  const target = join(ROOT, relativePath);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, content, "utf8");
}

async function cleanGeneratedPosts() {
  await mkdir(POSTS_DIR, { recursive: true });
  const files = await readdir(POSTS_DIR);
  await Promise.all(
    files
      .filter((file) => file.endsWith(".html"))
      .map((file) => rm(join(POSTS_DIR, file), { force: true }))
  );
}

await cleanGeneratedPosts();
await Promise.all([
  write("index.html", renderHome()),
  write("posts/index.html", renderArchive()),
  write("about.html", renderAbout()),
  write("standards.html", renderStandards()),
  write("contact.html", renderContact()),
  write("privacy.html", renderPrivacy()),
  write("terms.html", renderTerms()),
  write("404.html", render404()),
  write("sitemap.xml", renderSitemap()),
  write("feed.xml", renderFeed()),
  ...articles.map((article) => write(`posts/${article.slug}.html`, renderArticle(article)))
]);

console.log(`Built ${articles.length} verified articles and site pages.`);
