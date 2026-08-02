# Global Hot Reads — 아티클 생성 프롬프트

아래 프롬프트를 ChatGPT, Claude, Gemini 등 원하는 AI 서비스에 붙여넣고
`{주제}`와 `{카테고리}`만 바꿔서 사용하세요.

---

## 주제 선정 방법

### 주제 조건
- **2026년 현재 글로벌 미디어에서 활발히 다뤄지는 화제**
- 기존 아티클과 중복되지 않을 것 (아래 카테고리 목록 참고)
- 한국 독자에게 흥미로운 접점이 있을 것 (Korea angle)

### 주제 예시
| 좋은 예 | 이유 |
|---------|------|
| "TSMC 2nm 공정 양산 현황" | 글로벌 이슈 + 삼성과 비교 가능 |
| "생성형 AI 영상 편집 시장" | 2026 트렌드 + 한국 스타트업 각축 |
| "EU 디지털세의 글로벌 영향" | 정책 이슈 + 한국 기업 영향 있음 |
| "차세대 배터리 전쟁" | 기술 + 한국 주력 산업 |

### 피해야 할 주제
- 금융/투자/주식 추천 (YMYL — Google AdSense 제한)
- 건강/의학 관련 효능 주장 (YMYL)
- 정치적 논쟁
- 특정 기업 홍보성

## 카테고리 체계

### 기존 카테고리 목록 (중복 금지)
| 카테고리 | 사용처 | 설명 |
|----------|--------|------|
| 기술 · AI | AI, 소프트웨어, 개발자 도구 | ✅ 사용됨 |
| 기술 · 반도체 | 반도체, 파운드리, 칩 | ✅ 사용됨 (TSMC) |
| 기술 · 정책 | 규제, 법률, 디지털 정책 | ✅ 사용됨 |
| 기술 · 사회 | 기술의 사회적 영향 | ✅ 사용됨 |
| 과학 · 기술 | 배터리, 양자, 소재 | ✅ 사용됨 |
| 과학 · 로봇 | 로보틱스, 자동화 | ✅ 사용됨 |
| 과학 · 우주 | 항공, 위성, 우주탐사 | ✅ 사용됨 |
| 비즈니스 · 미디어 | OTT, 엔터테인먼트 | ✅ 사용됨 |
| 비즈니스 · 문화 | 업무 트렌드, 조직 문화 | ✅ 사용됨 |
| 비즈니스 · 이커머스 | 온라인 쇼핑, 커머스 | ✅ 사용됨 |
| 문화 · 기술 | 창작, 예술, AI 창작 | ✅ 사용됨 |

### 카테고리 규칙
- 포맷: `{대분류} · {소분류}` (가운데 점 · 으로 구분)
- 대분류: 기술 · 과학 · 비즈니스 · 문화 (4가지)
- 소분류: 구체적인 하위 분야 (기존 목록에 없으면 새로 추가 가능)
- 새 카테고리 추가 시 기존 카테고리와 의미상 중복되지 않아야 함

---

## 프롬프트

```
You are a professional Korean journalist writing for "Global Hot Reads",
a global media curation site covering tech, business, culture, and science.

Write a Korean curation article about {주제} in category {카테고리}.

Return ONLY valid JSON. No markdown fences, no code blocks.

{
  "title": "25-45자 분량의 한국어 제목",
  "subtitle": "50-90자 분량의 요약 부제",
  "tags": ["태그1", "태그2", "태그3", "태그4", "태그5"],
  "body_html": "전체 본문 HTML"
}

Requirements for body_html (600-900 words total):
- Use real 2026 trends, actual company names, real data/statistics
- Include a Korea-related angle or comparison in every article
- Structure: 1 intro paragraph → 3-4 h2 sections → 1 concluding section
- Include at least one <blockquote> with a credible source attribution
- Include at least one <ul> with 2-4 bullet points
- Write in informative, neutral journalistic tone (not promotional)
- Use <h2> for section headings, <p> for paragraphs
- Target length: 600-900 Korean words

Title format: "메인 키워드: 부연 설명"
Subtitle format: 완전한 문장으로 요약

Tags: 5 tags, first is the main category keyword
```

---

### 사용 예시

```
Topic: Apple Vision Pro 2세대
Category: 기술

...위 프롬프트 복붙...
Write a Korean curation article about Apple Vision Pro 2세대 in category 기술.
```

### 출력 예시 (JSON)

```json
{
  "title": "Apple Vision Pro 2세대가 그린 공간 컴퓨팅의 실제 — 가격·무게·콘텐츠 3대 과제",
  "subtitle": "2026년 출시된 비전 프로 2세대의 변화, 개발자 생태계 현황, 그리고 한국 시장에서의 전망을 정리합니다.",
  "tags": ["기술", "Apple", "공간컴퓨팅", "XR", "VisionPro"],
  "body_html": "<p>...</p><h2>...</h2><p>...</p>"
}
```

### 주의사항

- JSON 외 출력 금지 (설명문, 마크다운 금지)
- 모든 필드 한국어
- body_html은 HTML 태그만 포함 (JSON escape 처리)
```

