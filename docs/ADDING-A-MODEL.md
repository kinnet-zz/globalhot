# 모델 추가 가이드 / Adding a Model

새로운 모델을 GlobalHot 포털에 추가하는 방법입니다.

## 핵심 2단계

### 1. data/models.json에 모델 정보 추가

`data/models.json` 파일의 `models` 배열 **끝**에 새 객체를 추가합니다.

**주요 필드:**
- `id`: 모델의 고유 ID (kebab-case, 예: `new-model-id`)
- `name`: 표시 이름
- `altName`: 대체 이름 (없으면 빈 문자열)
- `country`: 국가 코드 (대문자: `JAPAN`, `KOREA`, `USA`, `UK`, `BRAZIL` 등)
- `tags`: 태그 (공백 구분 문자열, 예: `"cosplay gravure tv"`)
- `photoAvailable`: 프로필 사진 존재 여부 (빌드가 자동 보정하므로 대략적인 `true`/`false`로 충분)
- `officialUrl`: 공식 웹사이트 URL (없으면 빈 문자열)
- `sns`: SNS 링크 객체 (없으면 빈 문자열)

### 2. 프로필 사진 드롭 (선택)

프로필 사진이 있으면 `assets/profiles/<id>.jpg`로 파일을 드롭합니다.

**중요:**
- 사진 파일명은 `id` 값과 정확히 일치해야 합니다 (`.jpg` 확장자)
- **다른 파일은 건드리지 마세요** — `build-pages.mjs`, 테스트 파일 등은 수정 불필요
- 빌드가 `assets/profiles/` 디렉토리를 자동으로 수집합니다
- 사진이 없으면 그대로 두세요 — 자동으로 모노그램(CSS 이니셜)이 표시됩니다

## 자동 동작

### photoAvailable 자동 보정

빌드 시 `prepare-data.mjs`가 실제 파일 존재 여부를 확인하여 `photoAvailable`을 보정합니다:
- 파일이 있으면 → `true` (사진 표시)
- 파일이 없으면 → `false` (모노그램 표시)

따라서 `photoAvailable`은 대략적으로 `true`/`false`로 적어도 됩니다.

### 빈 URL 자동 검색 링크

`officialUrl`이나 SNS 필드가 비어있으면(`""`), 포털이 자동으로 모델 이름 기반 검색 링크를 생성합니다.

**중요: 가짜 URL을 절대 넣지 마세요.**
빈 문자열이 정직한 검색 링크보다 낫습니다. 존재하지 않는 URL을 넣으면 사용자 경험이 악화됩니다.

### 스키마 위반 감지 (안전망)

빌드 시 다음 위반 사항이 있으면 자동으로 실패하고 CI에서 즉시 잡힙니다:
- 빈 `id`
- 잘못된 타입
- 필수 필드 누락

이는 데이터 무결성을 보장하는 안전망입니다.

## 워크플로우

1. **data/models.json**에 모델 객체 추가
2. (선택) **assets/profiles/<id>.jpg**에 사진 드롭
3. Git 커밋: `git add data/models.json assets/profiles/<id>.jpg`
4. Git push: `git push origin master`
5. **GitHub Actions**가 자동으로 빌드/배포를 실행합니다

## 전체 예시

```json
{
  "id": "new-model-id",
  "name": "Display Name",
  "altName": "",
  "country": "JAPAN",
  "tags": "cosplay gravure",
  "photoAvailable": true,
  "officialUrl": "",
  "sns": {
    "x": "",
    "instagram": "",
    "youtube": "",
    "tiktok": ""
  }
}
```

**설명:**
- `id`: `kebab-case` 형식 (파일명 `new-model-id.jpg`와 일치)
- `country`: 대문자 국가 코드 (기존 데이터 참조)
- `tags`: 공백 구분 (예: `"cosplay gravure tv"`)
- `photoAvailable`: 사진 있으면 `true`, 없으면 `false` (빌드가 보정)
- `officialUrl`과 `sns` 필드: 없으면 빈 문자열 `""`로 남겨두기
