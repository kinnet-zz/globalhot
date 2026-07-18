# D1 정답률 활성화 체크리스트

Cloudflare Preview까지 활성화하고 실제 답안 저장을 검증했다.

## 완료

- [x] D1 데이터베이스 `globalhot-quiz` 생성
- [x] `migrations/0001_quiz_answers.sql` 원격 적용
- [x] Cloudflare Pages의 `QUIZ_DB` 바인딩 연결
- [x] 운영·미리보기 환경에 32바이트 이상 무작위 `QUIZ_COOKIE_SECRET` 등록
- [x] 미리보기에서 3개 `/api/quiz-answer` 요청의 200 응답과 D1 저장 확인

## 운영 배포 전 남은 작업

1. PR을 병합해 프로덕션에 배포한다.
2. 프로덕션에서 `/api/quiz-answer` POST와 중복 방지를 다시 확인한다.
3. Cloudflare Rate Limiting으로 `/api/quiz-answer`에 IP별 완만한 제한을 둔다. IP는 애플리케이션 DB에 저장하지 않는다.

예시 명령은 Cloudflare 계정과 프로젝트를 확인한 뒤 실행한다.

```sh
npx wrangler d1 create globalhot-quiz
npx wrangler d1 execute globalhot-quiz --remote --file=migrations/0001_quiz_answers.sql
```

개인정보 최소화:

- 무작위 익명 쿠키를 HMAC 서명하고, D1에는 다시 해시한 값만 저장한다.
- 정답 여부나 IP 주소는 저장하지 않는다. 선택 번호만 저장한다.
- 동일 브라우저의 같은 문항은 한 번만 집계한다.
- 원시 선택 데이터는 API 요청 시 90일이 지난 행을 자동 삭제한다.
- 표본 30명 미만이면 API도 선택지별 원시 집계를 숨겨 정답률을 역산할 수 없게 한다.
