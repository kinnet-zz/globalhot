# globalhot.net 리뉴얼 TODO

> 기준: 2026-08-27 · P0 완료 상태
> 사이트: https://globalhot.net (실시간 화제 랭킹 메인)
> 설계서: docs/HOTRANK-DESIGN.md

## ✅ 완료 (P0)

- [x] 랭킹 엔진: 공개 피드 수집기 + 점수 모듈 + 매시간 자동 집계 (rank-hourly.yml)
- [x] 이미지 소스 6개 플랫폼 16개 피드 (Flickr 6 / DeviantArt 3 / booru 3 / Mastodon 3 / Reddit 2 / News 2)
- [x] 랭킹 카드 썸네일 (TOP50 중 49개 커버)
- [x] 랭킹 = 메인(/) 전환, 기존 모델 포털 → /models.html 숨김 (sitemap 제외)
- [x] 영상 백그라운드 히어로 (main_202608081044.mp4)
- [x] 다국어 KO/EN/JA (언어 전환기, hreflang)
- [x] 커뮤니티 화제 등록 (X/인스타/스레드/유튜브 공식 임베드, D1, 하루 10건/IP)
- [x] 테스트 129개 통과, GitHub Actions + Cloudflare Pages 배포

## 🔜 P1 — 콘텐츠 심화 (다음 세션 추천)

- [ ] **상세 페이지 (/r/[slug])**: 항목별 임베드 재생 + "왜 화제?" AI 요약 2~3문장 + 순위 이력 그래프
  - 순위 스냅샷을 D1에 쌓는 구조부터 (현재는 ranking.json 최신본만 존재)
- [ ] **인물 페이지 (/t/[name])**: "○○ 최신 화제 콘텐츠" — models.json(216명)을 롱테일 SEO 허브로 연결
  - models.html 포털과 달리 "최신 화제" 중심 구성
- [ ] **인물 매칭 개선**: 현재 persons_top=0 (뉴스 제목에 모델명이 잘 안 나옴)
  - 소스 태그(booru 태그의 캐릭터/인물명) 매칭 추가, 한글/일본어/영문 이명 매칭 보강
- [ ] **아카이브 자동 증식**: 주간/월간 순위 확정 페이지 자동 생성 → sitemap 자동 갱신 (SEO 페이지 무한 증식 구조)
- [ ] **AI 요약 파이프라인**: 수집 항목 요약 + 3개 언어 번역 (Cloudflare Workers AI 또는 GitHub Actions 내 LLM)

## 💰 P2 — 광고 수익화 (트래픽 붙기 시작하면)

- [ ] **ads.txt 작성** (현재 빈 파일 — 구매자 신뢰 문제)
- [ ] **애드 네트워크 가입 + 슬롯 실장**: Adsterra / ExoClick 인피드 네이티브 (현재 광고 슬롯은 자리만 있음)
- [ ] 스티키 300x600, 상세페이지 3슬롯, 인터스티셜(랭킹→상세 이동 시, 1일 3회 제한)
- [ ] 광고 차단 폴백 확인 (ads.js 동작 점검)
- [ ] GA4 퍼널 설정: 히어로 CTA 클릭 → 랭킹 스크롤 → 상세 진입 → 원본 클릭
- [ ] 운영 원칙: 일 1,000 UV 미만엔 광고 최소화 (이탈률 보호)

## 📈 P3 — 소스/트래픽 확장

- [ ] 국내 커뮤니티 미러 소스 탐색 (aagag 방식 — 그라비아 관련 국내 커뮤니티 RSS/공개 목록)
- [ ] YouTube Data API (무료 할당량) — 신작 영상 소스
- [ ] X API 유료($200/월~) 검토 — 광고 수익이 비용을 넘길 때만
- [ ] 비활성 소스 재검토: Konachan(403), Gelbooru(401), Reddit(429 — CI에선 확인 필요)
- [ ] 커뮤니티 등록 활성화 유도 (등록 폼 노출/안내 강화)

## 🧹 유지보수

- [ ] GitHub Actions runner 지연 모니터링 (08-26 queued stuck 사례 있음 — 배포 안 되면 wrangler 로컬 직접 배포: `npm run build:pages && npx wrangler pages deploy dist --project-name globalhot --branch master`)
- [ ] D1 마이그레이션은 수동 적용 (`npx wrangler d1 execute globalhot-recommendations --remote --file migrations/XXX.sql`)
- [ ] .claude/WORK.md 커밋 여부 결정
- [ ] hero 영상 주기 교체 계획 (주간 1위 하이라이트, 10~15초 1080p 이하 권장)
