# GlobalHot Project Instructions

This file is mandatory project policy for OpenCode and any other coding agent
working in this repository.

## 1. Project Mission

GlobalHot is a Korean-language editorial site that explains global technology
and business developments using verifiable primary sources.

The product promise is:

> Do not merely translate headlines. Check the original material, explain the
> conditions behind numbers, separate fact from interpretation, and describe
> why the issue matters to Korean readers.

Keep the editorial scope focused:

- AI and software
- Technology policy and regulation
- Industrial technology such as robotics, semiconductors, and batteries
- Corporate filings and technology investment

Do not turn GlobalHot back into a generic global economy, stock-tip, lifestyle,
viral-news, or broad news-aggregation site.

## 2. Current Rebuild Summary

The 2026-07-29 rebuild made these intentional changes:

- Removed the automated article generation and automatic publishing workflow.
- Removed 13 unsupported or low-value legacy articles.
- Removed `analytics.js`, `app.js`, and `scripts/auto-publish.py`.
- Replaced the site with seven sourced technology briefings.
- Added a structured content source, static generator, and site audit.
- Rebuilt the home, archive, article, about, source standards, contact, privacy,
  terms, and 404 pages.
- Added canonical metadata, Article JSON-LD, breadcrumbs, sitemap, RSS, headers,
  and equivalent-URL redirects.
- Set the public author name to `거리의악사`.

Do not restore removed automation, legacy copy, unsupported claims, or deleted
articles unless the user explicitly requests it and every claim is re-researched.

## 3. Source Of Truth

Edit these files:

- `content/articles.mjs`: article content and article metadata
- `content/site.mjs`: site identity and global metadata
- `scripts/build.mjs`: generated page templates, sitemap, and RSS
- `style.css`: visual system and responsive layout
- `_headers` and `_redirects`: Cloudflare Pages behavior

Generated files include:

- `index.html`
- `posts/index.html`
- `posts/*.html`
- `about.html`
- `standards.html`
- `contact.html`
- `privacy.html`
- `terms.html`
- `404.html`
- `sitemap.xml`
- `feed.xml`

Do not manually edit generated HTML. It will be overwritten by the next build.
Change the structured content or generator and rebuild instead.

## 4. Non-Negotiable Editorial Rules

Every public article must:

1. Provide original analysis or practical interpretation, not a translated
   summary of another publication.
2. Use at least three relevant HTTPS sources.
3. Prioritize laws, regulator documents, filings, research papers, standards,
   datasets, and official technical documentation.
4. Use at least two primary or first-party sources when the topic permits.
5. Link to the exact document or article, not merely an organization homepage.
6. Explain what each source supports.
7. Separate confirmed facts, limitations, and GlobalHot interpretation.
8. State the actual publication and update dates. Never backdate content.
9. Include the author `거리의악사`, a correction path, and a source access date.
10. Explain the relevance to Korean readers when there is a defensible
    connection. Do not force a Korean angle when evidence is absent.

Never:

- Invent, estimate, or silently alter facts, dates, statistics, quotations,
  credentials, organizations, studies, product names, or source URLs.
- Use prompts or copy that request a "plausible" expert, quote, trend, source,
  statistic, or event.
- Present a forecast as a confirmed schedule.
- Use a press release as independent proof of the issuing company's claim.
- Copy or closely paraphrase long passages from a source.
- Publish a thin listicle, generic definition page, keyword page, or rewritten
  press release solely to increase page count.
- Claim that AI-generated text is human-written or attempt to evade AI
  detection. Accuracy, originality, and editorial responsibility matter more
  than detection scores.
- Publish an unreviewed draft automatically.

If a source cannot be opened or a claim cannot be verified, remove the claim,
replace the source with a verifiable primary source, or clearly label the
uncertainty. Never fill the gap with model memory.

## 5. Article Structure

New entries in `content/articles.mjs` must contain:

- A stable lowercase ASCII slug
- Honest `published` and `updated` dates
- A focused category and eyebrow
- A descriptive title, summary, and introduction
- A realistic reading time
- Three useful takeaways
- At least five substantive sections
- Article-specific sources with publisher, title, exact URL, and source note
- A disclaimer when the subject could be mistaken for investment, legal,
  medical, or safety advice

Suggested article flow:

1. What is confirmed
2. What the number or announcement does not prove
3. How sources or studies differ
4. Practical implications
5. What to monitor next

Do not pad an article to reach an arbitrary word count. Add material only when
it improves evidence, context, comparison, or reader usefulness.

## 6. Publishing Cadence

The editorial target is approximately two high-quality articles per week.

- Quality and verification take priority over schedule.
- Do not generate filler because a target date was missed.
- Do not publish multiple backdated articles to simulate an established history.
- Update an existing article when new evidence changes the interpretation.
- Keep the update date and correction note honest.

Automatic collection may be used only to discover candidate topics. It must not
publish, merge, deploy, invent facts, or create public copy without source
verification and explicit user approval.

## 7. Design And Reader Experience

The site must feel like a restrained, professional editorial publication.

Preserve:

- The `GlobalHot` brand and red/charcoal/teal visual system
- Strong typography and readable article measure
- A full-width editorial hero with a relevant visual
- Clear navigation to briefings, source standards, and about
- Source lists that are easy to inspect
- Responsive layouts without overlap at mobile, tablet, and desktop sizes

Avoid:

- AdSense-review messaging, trust theater, or internal workflow explanations on
  the home page
- Sections titled around "AI writing process", "human final review", approval
  preparation, or content-production steps
- Decorative card walls, nested cards, oversized rounded boxes, gradient orbs,
  or generic finance-dashboard styling
- Fake urgency, sensational headlines, clickbait, or stock-price predictions
- Repeating the same filler disclaimer throughout the visible interface
- Text or controls that overflow or overlap at any supported viewport

Public-facing copy should explain reader value, evidence, scope, corrections,
and authorship. Internal production details belong in this file, not on the
home page.

## 8. SEO And Indexing Rules

Use one canonical host:

- Canonical: `https://globalhot.net`
- `https://www.globalhot.net/*` redirects to the non-`www` host

For every indexable HTML page:

- Provide a unique title and meta description.
- Provide one unique canonical URL.
- Set Korean language metadata.
- Include Open Graph metadata.
- Use semantically correct headings.
- Keep internal links crawlable without client-side JavaScript.

For every article:

- Include valid `Article` JSON-LD.
- Include author, publisher, dates, image, and citation URLs.
- Add the canonical URL to `sitemap.xml`.
- Add the article to `feed.xml`.

Redirect only genuinely equivalent URLs. Do not redirect unrelated removed
articles to the home page to hide 404 responses. Do not create duplicate pages,
tracking-parameter canonicals, tag archives with no value, or empty categories.

Do not change dates or duplicate content merely to make the site appear fresh.

## 9. AdSense, Ads, Privacy, And Trust

No agent can guarantee AdSense approval. Never promise a score or guaranteed
approval in code, copy, documentation, or user-facing messages.

The site must be useful without advertising. AdSense preparation is a quality
constraint, not the site's public purpose.

Do not:

- Add ad units, analytics, trackers, cookie banners, affiliate links, or
  newsletter collection without explicit user approval.
- Encourage clicks on ads or place ads where they can be confused with
  navigation or article content.
- Alter the existing AdSense publisher ID in `ads.txt` without explicit user
  confirmation.
- Claim that advertising is active when it is not.
- Add a fake consent banner that does not control actual storage and vendors.

When advertising or analytics is introduced:

- Update `privacy.html` before deployment.
- Use a Google-certified consent management platform where required.
- Provide meaningful consent choices and honor them.
- Verify that ad placement does not obscure navigation, sources, or article
  content.

Relevant official policies to re-check before material policy changes:

- Google helpful content:
  `https://developers.google.com/search/docs/fundamentals/creating-helpful-content`
- Google spam policies:
  `https://developers.google.com/search/docs/essentials/spam-policies`
- AdSense program policies:
  `https://support.google.com/adsense/answer/48182`

Use current official documentation. Do not rely only on model memory for search,
advertising, privacy, legal, or platform policy.

## 10. Development Workflow

Before editing:

1. Read this file.
2. Read `content/site.mjs`, the relevant entries in `content/articles.mjs`, and
   the related generator/template code.
3. Check `git status` and preserve unrelated user changes.
4. Research current external facts using official sources.

After editing:

1. Rebuild the site.
2. Run the site audit.
3. Check the Git diff.
4. Perform browser QA on affected pages.
5. Commit to a feature branch and open a PR.

Commands:

```text
# Windows
npm.cmd run audit

# macOS/Linux
npm run audit

git diff --check
git status --short
```

The audit must pass before publishing. It verifies article structure, source
requirements, internal links, canonical uniqueness, sitemap, RSS, and removal of
known low-quality legacy patterns.

Browser QA must include:

- Home page
- Article archive
- At least one changed article
- Any changed policy or trust page
- Console errors
- Mobile `375x812`
- Tablet `768x1024`
- Desktop `1280x720`

Check long Korean titles, English source titles, footer links, source cards, and
navigation for overflow and overlap.

## 11. Git And Deployment Policy

- Do not push directly to `master`.
- Do not force-push a shared branch.
- Do not merge a PR without explicit user approval.
- Do not re-enable automatic content publishing or automatic merging.
- Keep generated output in the same commit as its source change.
- Keep QA screenshots, browser state, secrets, and local environment files out
  of Git.

Cloudflare Pages deploys the production site after the approved PR is merged
into `master`. A successful local build does not mean the live domain changed.

After deployment, verify:

- `https://globalhot.net/`
- A changed article URL
- `https://globalhot.net/robots.txt`
- `https://globalhot.net/sitemap.xml`
- `https://globalhot.net/feed.xml`
- `https://globalhot.net/ads.txt`
- Canonical host redirects
- Response status, console errors, and responsive layout

## 12. Completion Standard

A change is complete only when:

- It improves reader value or verifiability.
- All claims are traceable to suitable sources.
- The concept remains consistent.
- No removed low-value automation or content has returned.
- Generated files match structured source files.
- `npm run audit` and `git diff --check` pass.
- Browser QA passes.
- The PR clearly explains content, policy, SEO, and deployment impact.

When requirements conflict, prioritize in this order:

1. Factual accuracy and user safety
2. Reader value and source transparency
3. Privacy and platform policy compliance
4. Concept consistency and usability
5. Publishing speed and monetization
