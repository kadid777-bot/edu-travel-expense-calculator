# CLAUDE.md

- 비밀 값(.env)은 출력하지 말고 "있음/없음"만 보고한다. 키는 서버 코드에서만 쓰고 `NEXT_PUBLIC_`을 붙이지 않으며, 계정 토큰(GitHub·Vercel 등)은 프로젝트 `.env`에 두지 않는다.
- 금액은 지어내지 않는다: 규정 숫자는 `data/rules.ts`, 계산은 `lib/calc`에만 두고, 외부 조회가 실패하면 보류+경고로 처리한다. 코드를 고친 뒤에는 `npx tsc --noEmit`·`npx eslint`·`npm test`를 돌리고, 외부 조회나 AI에 영향이 있으면 `npm run test:live`와 `npm run build`도 돌린다.
