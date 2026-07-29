import { access, readFile, readdir } from "node:fs/promises";
import { dirname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { articles } from "../content/articles.mjs";
import { site } from "../content/site.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

function fail(message) {
  failures.push(message);
}

function fileForPath(pathname) {
  const clean = pathname.split("#")[0].split("?")[0];
  if (clean === "/") return join(ROOT, "index.html");
  if (clean.endsWith("/")) return join(ROOT, clean, "index.html");
  return join(ROOT, clean);
}

for (const article of articles) {
  if (!article.slug || !/^[a-z0-9-]+$/.test(article.slug)) {
    fail(`Invalid slug: ${article.slug}`);
  }
  if (article.sources.length < 3) {
    fail(`${article.slug} has fewer than 3 sources`);
  }
  const sourceUrls = new Set(article.sources.map((source) => source.url));
  if (sourceUrls.size !== article.sources.length) {
    fail(`${article.slug} has duplicate source URLs`);
  }
  for (const source of article.sources) {
    if (!source.url.startsWith("https://")) {
      fail(`${article.slug} has a non-HTTPS source: ${source.url}`);
    }
    if (!source.note || source.note.length < 12) {
      fail(`${article.slug} has an unexplained source: ${source.title}`);
    }
  }
  if (article.takeaways.length < 3 || article.sections.length < 5) {
    fail(`${article.slug} is missing substantive article structure`);
  }
}

const htmlFiles = [];
const ignoredDirectories = new Set([".git", "node_modules", "qa"]);

async function collectHtml(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    if (
      entry.isDirectory() &&
      (ignoredDirectories.has(entry.name) || entry.name.startsWith(".gstack"))
    ) {
      continue;
    }
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await collectHtml(path);
    if (entry.isFile() && entry.name.endsWith(".html")) htmlFiles.push(path);
  }
}

await collectHtml(ROOT);

const canonicals = new Map();
const forbidden = [
  "plausible expert",
  "GlobalHot Bot",
  "BETA",
  "auto-publish",
  "가치가 별로 없는 콘텐츠"
];

for (const file of htmlFiles) {
  const source = await readFile(file, "utf8");
  for (const phrase of forbidden) {
    if (source.includes(phrase)) fail(`${file} contains forbidden phrase: ${phrase}`);
  }
  if (!source.includes('lang="ko"')) fail(`${file} is missing Korean language metadata`);
  if (!source.includes('name="description"')) fail(`${file} is missing a meta description`);
  if (!source.includes('rel="canonical"')) fail(`${file} is missing a canonical URL`);
  if (!source.includes('property="og:title"')) fail(`${file} is missing Open Graph metadata`);

  const canonical = source.match(/<link rel="canonical" href="([^"]+)">/)?.[1];
  if (canonical) {
    if (canonicals.has(canonical)) {
      fail(`Duplicate canonical ${canonical}: ${canonicals.get(canonical)} and ${file}`);
    }
    canonicals.set(canonical, file);
  }

  const hrefs = [...source.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);
  for (const href of hrefs) {
    if (
      href.startsWith("https://") ||
      href.startsWith("http://") ||
      href.startsWith("mailto:") ||
      href.startsWith("#")
    ) {
      continue;
    }
    const target = href.startsWith("/")
      ? fileForPath(href)
      : normalize(join(dirname(file), href.split("#")[0].split("?")[0]));
    try {
      await access(target);
    } catch {
      fail(`Broken internal link in ${file}: ${href}`);
    }
  }
}

const expectedArticleFiles = new Set(articles.map((article) => `${article.slug}.html`));
const postFiles = (await readdir(join(ROOT, "posts"))).filter(
  (file) => file.endsWith(".html") && file !== "index.html"
);
for (const file of postFiles) {
  if (!expectedArticleFiles.has(file)) fail(`Unexpected legacy article remains: ${file}`);
}
for (const file of expectedArticleFiles) {
  if (!postFiles.includes(file)) fail(`Missing generated article: ${file}`);
}

const sitemap = await readFile(join(ROOT, "sitemap.xml"), "utf8");
for (const article of articles) {
  const url = `${site.url}/posts/${article.slug}.html`;
  if (!sitemap.includes(`<loc>${url}</loc>`)) fail(`Sitemap missing ${url}`);
}

const feed = await readFile(join(ROOT, "feed.xml"), "utf8");
for (const article of articles) {
  if (!feed.includes(`${site.url}/posts/${article.slug}.html`)) {
    fail(`RSS feed missing ${article.slug}`);
  }
}

if (failures.length) {
  console.error(`Site audit failed with ${failures.length} issue(s):`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(
  `Site audit passed: ${articles.length} sourced articles, ${htmlFiles.length} HTML pages, unique canonicals, complete sitemap and RSS.`
);
