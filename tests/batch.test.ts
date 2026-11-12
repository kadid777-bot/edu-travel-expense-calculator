import { describe, expect, it, vi } from "vitest";
import { POST } from "../app/api/calculate-batch/route";
import { CHUNK_SIZE, chunk, parseRows, toCsv } from "../lib/calc/batch";

const LINE = "홍길동,서울특별시,강남구,기차,30000,서울특별시,강남구,기차,30000,1,70000";

describe("명단 변환", () => {
  it("쉼표·탭 구분, 제목줄 건너뛰기, 교통수단 한글을 변환한다", () => {
    const r = parseRows(`이름,가는편 시·도\n${LINE}\n${LINE.replaceAll(",", "\t").replace("기차", "자차")}`);
    expect(r.errors).toEqual([]);
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0].input.outbound).toMatchObject({ sido: "서울특별시", transport: "train", transportActual: 30000 });
    expect(r.rows[1].input.outbound).toMatchObject({ transport: "car", tollActual: 30000 });
    expect(r.rows[0].input.lodgingActuals).toEqual([70000]);
  });

  it("잘못된 줄은 줄 번호와 이유를 알려준다", () => {
    const r = parseRows(`${LINE}\n김철수,서울특별시,강남구,우주선,abc,서울특별시,강남구,기차,1000,x`);
    expect(r.rows).toHaveLength(1);
    expect(r.errors[0].line).toBe(2);
    expect(r.errors[0].message).toContain("교통수단");
  });

  it("25명씩 나눈다 (110명 → 5묶음)", () => {
    expect(chunk(Array.from({ length: 110 }, (_, i) => i))).toHaveLength(5);
    expect(CHUNK_SIZE).toBe(25);
  });

  it("CSV는 수식으로 읽힐 글자를 막는다", () => {
    expect(toCsv([["=1+1", 5]])).toContain("'=1+1");
  });
});

describe("POST /api/calculate-batch", () => {
  const call = (body: unknown) =>
    POST(
      new Request("http://x/api/calculate-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": "7.7.7.7" },
        body: JSON.stringify(body),
      }),
    );
  const row = (rowNo: number) => ({
    rowNo,
    outbound: { sido: "서울특별시", sigungu: "강남구", transport: "train", transportActual: 1000 },
    inbound: { sido: "서울특별시", sigungu: "강남구", transport: "train", transportActual: 1000 },
    nights: 0,
  });

  it("26명 이상은 400", async () => {
    vi.stubEnv("MOCK_EXTERNAL", "1");
    const res = await call({ courseId: "course-01", rows: Array.from({ length: 26 }, (_, i) => row(i + 1)) });
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("BATCH_TOO_LARGE");
  });

  it("25명은 200이고 행마다 결과 또는 오류를 돌려준다", async () => {
    vi.stubEnv("MOCK_EXTERNAL", "1");
    const rows = Array.from({ length: 25 }, (_, i) => row(i + 1));
    rows[3] = { ...rows[3], outbound: { ...rows[3].outbound, sido: "없는도" } };
    const res = await call({ courseId: "course-01", rows });
    expect(res.status).toBe(200);
    const { results } = (await res.json()).data;
    expect(results).toHaveLength(25);
    expect(results[0].result.items).toHaveLength(5);
    expect(results[3].error).toBeTruthy();
    vi.unstubAllEnvs();
  });
});
