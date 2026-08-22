# GlobalHot 작업 규칙 (AGENTS.md)

완성고정 스택: **정적 HTML + Cloudflare Pages**. Node 22. 절대 프레임워크/빌드 도구를 임의로 갈아엎지 않는다.

## 소스 오브 트루스
- 모델 데이터의 단일 원천은 `data/models.json`. 여기만 고친다.
  - 전체 201명, **게시(photoAvailable=true) 114명** (기준일 2026-08-22 — 모델 추가 시 갱신).
  - `data/gravure-queue.json`은 비어 있음 — 후보는 스크립트로만 발굴.
- `fields`는 `id,name,altName,country,tags,photoAvailable,officialUrl,sns,license,creditText,creditUrl,bio,photoUrl,birth,origin,debut,occupation,yearsActive,agency,notable,awards,recent`.
  - 새 필드를 쓰면 반드시 최상위 `fields` 목록에도 추가한다.

## 상세 프로필 표준 규격 (게시 모델 전원 적용)
게시(bio·프로필 확장) 단계는 **플랫폼 기준 없이 문단을 늘리지 않는다**. 아래 구조화 필드와 bio 서술 구조가 **표준**이다. 검증 안 된 값은 절대 채우지 않는다(빈 문자열 유지).

- **구조화 필드** (models.json 각 모델에 추가, 비어 있어도 무방):
  - `birth`(생년월일, `YYYY-MM-DD`), `origin`(출신지), `debut`(데뷔), `occupation`(직업), `yearsActive`(활동기간), `agency`(소속), `notable`(대표 활동/작품 문자열 배열), `awards`(수상/표창 문자열 배열), `recent`(최근 활동 문자열 배열).
- **bio 서술 구조 (2~4문장 고정)**:
  1. [출생·출신 + 직업/아이덴티티]
  2. [데뷔·대표 활동(잡지·사진집·무대·방송)]
  3. [최근 활동·수상·특기 (있으면)]
- **데이터 파이프라인**: `scripts/bio-research.mjs`가 위키에서 구조화 필드 원본(생년월일·출신·직업·활동기간·소속·최근 활동)을 `data/bio-report.json`으로 수집 → 작성자는 이 리포트만 보고 페이지에 반영. 리포트에 없는 사실은 추가 금지, 리포트 매칭이 의심되면(제목 불일치) 반영하지 않는다.
- **model.html 렌더링**: 좌측 "모델 소개"(bio 문단) + 레일(출생·출신·활동기간·소속사) + 하단 구조화 섹션(대표 활동/수상/최근 활동)을 표준으로 출력. 값이 빈 필드는 렌더링에서 제외.

## 신규 모델 추가 규칙 (반드시)
- **상세프로필(bio)은 필수 작성** 후에만 추가한다. `scripts/gravure-add.mjs`는 bio(비어있지 않고 20자 이상)가 없는 큐 항목을 **추가하지 않는다**. 게시 페이지가 빈 상태로 배포되는 것을 원천 차단.
- bio는 위키(영/일)에서 검증한 생년월일·출신·데뷔·대표 활동을 1~2문장으로 작성. 추측·허위·빈 플레이스홀더 금지.
- **본 디렉터리는 "섹시 모델"(그라비아·코스프레·수영복 등) 중심**이다. **가수·밴드·정치인·스포츠 출신자 등 비(非) 모델 인물의 사진을 모델 프로필로 게시하지 않는다.** bio가 그 인물이 모델이 아니라고 명시하면 게시하지 않는다(예: AKMU 가수 이수현).
- **사진 검증 규칙:** 파일 제목을 성(姓) 하나나 토큰만으로 매치하지 않는다. 풀네임 전체가 제목에 **연속 토큰**으로(정순 또는 성-이름 역순) 등장해야 한다(`nameTokensContain`). "Kang In-kyung"이 "Kang Kyung-wha in Tokyo" 같은 외교부 장관 사진과 엮이는 재발을 차단한다.

## 사진 sourcing 규칙 (무료·상업 사용 가능한 사이트)
- **Wikimedia Commons** (commons.wikimedia.org): 기술적 참조 이미지 검색. CC 라이선스(특히 CC BY-SA)만 허용. 반드시 최종 사진의 라이선스를 직접 확인.
- **Pixabay** (pixabay.com): "Sponsored Image" 제외하고 모두 상업 사용 가능. 영어 검색 권장.
- **Unsplash** (unsplash.com): 감성적 느낌의 사진. "Download free" 아이콘이 있는 것만 상업 사용 가능.
- **주의:** 최종 사용 사진의 라이선스를 반드시 최종 확인. 상업 사용 가능하다고 해도 모델 초상写真は 권리자의 요청에 따라 삭제해야 함.

## 작업 승인 규칙 (반드시)
**작업하기 전에 반드시 설명하고 승인을 받아야 한다.** 코드 수정, 파일 생성/삭제, 커밋/푸시, 스크립트 실행 등 모든 작업 전에 "무엇을 하려는지"를 명시하고 사용자의 승인을 받은 후 진행한다. 승인 없이 절대 먼저 코드를 건드리지 않는다.

## 반드시 해야 할 일 (MUST/DO)
1. **게시 모델 bio는 반드시 실제 정보**로 작성. 출처는 **Wikipedia(영/일**, 필요시 나무위키 교차)에서 확인한 생년월일·출신·데뷔·대표 활동을 **표준 규격(2~4문장)** 으로 작성.
2. 프로필의 bio와 stats(생년월일 등)는 **검증된 값만** 넣는다.
3. 배포 전 반드시 검증: `npm test`(**118/118 통과**) → `npm run build:pages`(**145 files**) 모두 성공해야 한다. (테스트·파일 수는 증가할 수 있음 — 기준값)
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
- 새 모델 추가: `scripts/gravure-add.mjs` 파이프라인(다운로드+검증+추가). 다운로드 실패/非JPEG는 추가하지 않는다. **bio 미작성 항목은 추가하지 않는다.**
- 상세 프로필 확장: `scripts/bio-research.mjs`로 리포트 생성 → `data/bios-extended.json`에 표준 규격 bio 작성 → `scripts/bio-apply.mjs --overwrite` 병합.
- 랭킹: 로컬 추천 카운트 0부터 → 카테고리(gravure→cosplay→기타) → 이름(ko) 순 타이브레이크.