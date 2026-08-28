# 작업 메모 (Work Notes)

## 2026-08-13

### 댓글 기능 검토
- 댓글 기능은 모델 프로필 페이지 방문객이 댓글 작성하는 시스템
- `functions/_lib/comments.js` - 댓글 핵심 로직
- `functions/api/comments/[modelId].js` - GET/POST 엔드포인트
- `functions/api/admin/comments/index.js` - 관리자 댓글 조회
- `functions/api/admin/comments/[commentId].js` - 관리자 댓글 삭제

### 최근 수정 완료
- 댓글 에러 원인: D1 `models` 테이블에 12개 모델만 존재해 `activeModel()` 체크에서 제외된 모델의 댓글 작성 차단
- 해결: `activeModel()` 체크 및 `ACTIVE` 상수 제거, 관리자 페이지 `JOIN models` 제거
- `COMMENTS_SALT` 시크릿 설정 필요 (Cloudflare 대시보드)

### 다음 작업
- 댓글 작성 실제 테스트 (COMMENTS_SALT 설정 후)
- 국내 커뮤니티 핫이슈 수집 방안 (RSS 미지원 커뮤니티 대응)
