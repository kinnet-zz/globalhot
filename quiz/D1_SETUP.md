# D1 정답률 활성화 체크리스트

코드는 준비됐지만 실제 Cloudflare 자원 생성·배포는 별도 승인 후 진행한다.

1. D1 데이터베이스 `globalhot-quiz`를 만든다.
2. `migrations/0001_quiz_answers.sql`을 원격 D1에 적용한다.
3. Cloudflare Pages 프로젝트에 D1 바인딩 이름 `QUIZ_DB`를 연결한다.
4. 32바이트 이상의 무작위 비밀값을 `QUIZ_COOKIE_SECRET` 환경변수로 등록한다.
5. 미리보기 환경에서 `/api/quiz-answer` POST와 중복 집계를 확인한 뒤 프로덕션에 배포한다.
6. Cloudflare Rate Limiting으로 `/api/quiz-answer`에 IP별 완만한 제한을 둔다. IP는 애플리케이션 DB에 저장하지 않는다.

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
