import { describe, expect, it, vi } from "vitest";
import { calculateExpense } from "../lib/calc/calculate";
import { validateInput } from "../lib/calc/schema";
import { getLookups } from "../lib/external/lookups";
import { POST } from "../app/api/calculate/route";

const custom = {
  venueSido: "대전광역시",
  venueSigungu: "유성구",
  startDate: "2026-12-07",
  endDate: "2026-12-09",
  lodgingProvided: false,
  mealsProvided: false,
};
const leg = { sido: "서울특별시", sigungu: "강남구", transport: "train", transportActual: 30000 };
const input = { courseId: "custom", customCourse: custom, outbound: leg, inbound: leg, nights: 2, lodgingActuals: [70000, 120000], mealDays: 3 };

describe("기타(직접 입력) 교육 과정", () => {
  it("입력한 장소·기간으로 숙박 상한(서울 외 80,000원)과 식비 일수를 계산한다", () => {
    const checked = validateInput(input);
    expect(checked.ok).toBe(true);
    if (!checked.ok) return;
    const r = calculateExpense(checked.data, { outbound: { fare: 21_600 }, inbound: { fare: 21_600 } });
    expect(r.items[0].approved).toBe(21_600); // 열차요금 상한
    expect(r.items[2].approved).toBe(70_000 + 80_000); // 박별 상한 80,000원
    expect(r.items[4].approved).toBe(36_000 * 3);
  });

  it("교육 장소가 서울이면 숙박 상한이 100,000원이다", () => {
    const busan = { sido: "부산광역시", sigungu: "해운대구", transport: "train", transportActual: 30000 };
    const seoul = { ...input, outbound: busan, inbound: busan, customCourse: { ...custom, venueSido: "서울특별시", venueSigungu: "강남구" } };
    const checked = validateInput(seoul);
    expect(checked.ok).toBe(true);
    if (!checked.ok) return;
    const r = calculateExpense(checked.data, { outbound: { fare: 21_600 }, inbound: { fare: 21_600 } });
    expect(r.items[2].approved).toBe(70_000 + 100_000);
  });

  it("장소·날짜가 비었거나 잘못되면 칸별 오류를 알려준다", () => {
    const bad = validateInput({ ...input, customCourse: { ...custom, venueSigungu: "", startDate: "", endDate: "2026-02-30" } });
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(Object.keys(bad.fieldErrors)).toEqual(expect.arrayContaining(["customCourse.venueSigungu", "customCourse.startDate", "customCourse.endDate"]));
    }
    const reversed = validateInput({ ...input, customCourse: { ...custom, startDate: "2026-12-09", endDate: "2026-12-07" } });
    expect(reversed.ok).toBe(false);
    expect(validateInput({ ...input, customCourse: undefined }).ok).toBe(false);
    const long = validateInput({ ...input, customCourse: { ...custom, endDate: "2027-03-01" } });
    expect(long.ok).toBe(false);
  });

  it("숙박 박수·식비 일수는 직접 입력한 교육 일수로 제한한다", () => {
    expect(validateInput({ ...input, nights: 3, lodgingActuals: [1, 2, 3] }).ok).toBe(false); // 3일 교육 → 최대 2박
    expect(validateInput({ ...input, mealDays: 4 }).ok).toBe(false);
  });

  it("숙소·식사 제공을 체크하면 숙박비·식비는 0원", () => {
    const checked = validateInput({ ...input, customCourse: { ...custom, lodgingProvided: true, mealsProvided: true } });
    expect(checked.ok).toBe(true);
    if (!checked.ok) return;
    const r = calculateExpense(checked.data, { outbound: { fare: 21_600 }, inbound: { fare: 21_600 } });
    expect(r.items[2].approved).toBe(0);
    expect(r.items[4].approved).toBe(0);
  });

  it("외부 조회(가상)와 /api/calculate도 기타 과정을 받는다", async () => {
    vi.stubEnv("MOCK_EXTERNAL", "1");
    const checked = validateInput(input);
    if (!checked.ok) throw new Error("검사 실패");
    expect((await getLookups(checked.data)).lookups.outbound).toBeDefined();
    const res = await POST(
      new Request("http://x/api/calculate", { method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": "5.5.5.5" }, body: JSON.stringify(input) }),
    );
    expect(res.status).toBe(200);
    const bad = await POST(
      new Request("http://x/api/calculate", { method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": "5.5.5.5" }, body: JSON.stringify({ ...input, customCourse: { ...custom, startDate: "" } }) }),
    );
    expect(bad.status).toBe(400);
    vi.unstubAllEnvs();
  });
});
