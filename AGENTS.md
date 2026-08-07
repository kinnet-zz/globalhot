# GlobalHot 작업 규칙 (AGENTS.md)

완성고정 스택: **정적 HTML + Cloudflare Pages**. Node 22. 절대 프레임워크/빌드 도구를 임의로 갈아엎지 않는다.

## 소스 오브 트루스
- 모델 데이터의 단일 원천은 `data/models.json`. 여기만 고친다.
  - 전체 192명, **게시(photoAvailable=true) 105명**.
  - `data/gravure-queue.json`은 비어 있음 — 후보는 스크립트로만 발굴.
- `fields`는 `id,name,altName,country,tags,photoAvailable,officialUrl,sns,license,creditText,creditUrl`.
  - 새 필드(예: `bio`)를 쓰면 반드시 최상위 `fields` 목록에도 추가한다.

## 반드시 해야 할 일 (MUST/DO)
1. **게시 모델 bio는 반드시 실제 정보**로 작성. 출처는 **Wikipedia(영/일**, 필요시 나무위키 교차)에서 확인한 생년월일·출신·데뷔·대표 활동을 간결하게(1~2문장 이내).
2. 프로필의 bio와 stats(생년월일 등)는 **검증된 값만** 넣는다.
3. 배포 전 반드시 검증: `npm test`(**87/87 통과**) → `npm run build:pages`(**36 files**) 모두 성공해야 한다.
4. 배포는 `git push origin master` → GitHub Actions deploy.yml → Cloudflare Pages(프로젝트 `globalhot`). 커밋 메시지는 feat(chore로 구분, 예: `feat(ranking): ...`).
5. 원격에 크론/자동 커밋이 쌓여 있으면 `git pull --rebase` 후 푸시.
6. 공식 링크는 실존 확인된 것만. people: `officialUrl`·SNS(x/insta/youtube/tiktok)에 진짜 URL만, 미확인은 빈 문자열 유지.
7. 사진․출처는 CC 라이선스만. `license`/`creditText`/`creditUrl` 게재 규칙 유지.
8. 자신에게 불필요하거나 검증 안 된 건 빈 값/미게재로 두고, 마음대로 임의 숫자를 넣지 않는다.

## 하면 안 되는 일 (MUST NOT/DON'T)
1. **프로필 정보를 추측·허위로 적지 않는다.** 모르면 비운다.
2. **빈 플레이스홀더를 그대로 두지 않는다.** `"최신 활동은 공식 채널과 소속사 프로필에서 확인하세요"` 같은 무미건조한 텍스트는 bio로 허용하지 않는다 — 반드시 실제 내용으로 교체.
3. 웹 검색/QA에 `mcp__claude-in-chrome__*` 사용 금지. **반드시 gbrowser의 `/browse` 스킬** 사용.
4. 시크릿·API 키·개인정보를 커밋하지 않는다.
5. 커밋/푸시는 **사용자가 명시적으로 요청할 때만**. 검증(test/build)을 건너뛰고 배포하지 않는다.
6. 코드에 불필요한 주석을 추가하지 않는다(주석은 요청 시에만).

## 기타 플로우
- 새 모델 추가: `scripts/gravure-add.mjs` 파이프라인(다운로드+검증+추가). 다운로드 실패/非JPEG는 추가하지 않는다.
- 랭킹: 로컬 추천 카운트 0부터 → 카테고리(gravure→cosplay→기타) → 이름(ko) 순 타이브레이크.