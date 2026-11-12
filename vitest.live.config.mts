// 실서비스 점검용 설정: 실제 외부 서비스(TAGO·네이버·오피넷·OpenAI)를 호출한다. 실행: npm run test:live
// .env의 키를 읽어 테스트 프로세스에 넣는다(값은 출력하지 않는다).
import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/live/**/*.live.test.ts"],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    fileParallelism: false,
    setupFiles: ["tests/setup.ts"],
    env: loadEnv("", process.cwd(), ""),
  },
});
