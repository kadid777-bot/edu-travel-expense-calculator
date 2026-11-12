import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    exclude: ["tests/live/**", "node_modules/**"], // 실서비스 점검은 `npm run test:live`로 따로 실행
    setupFiles: ["tests/setup.ts"],
  },
});
