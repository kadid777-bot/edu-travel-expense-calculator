import { describe, expect, it } from "vitest";
import { getCourse } from "../data/courses";
import { calculateExpense } from "../lib/calc/calculate";
import { cityKey, isLocalLeg } from "../lib/calc/zone";

describe("시내 판정은 시·군 단위", () => {
  it("광역시는 구가 달라도 같은 시", () => {
    expect(cityKey("부산광역시", "해운대구")).toBe(cityKey("부산광역시", "남구"));
  });
  it("도의 시는 구를 떼고 비교한다", () => {
    expect(cityKey("경기도", "수원시 팔달구")).toBe(cityKey("경기도", "수원시 영통구"));
    expect(cityKey("경기도", "수원시 팔달구")).not.toBe(cityKey("경기도", "성남시 분당구"));
  });
  it("같은 시의 다른 구에서 오가면 여비가 0원이다", () => {
    const course = getCourse("course-02")!; // 부산 남구
    const leg = { sido: "부산광역시", sigungu: "해운대구", transport: "bus" as const };
    expect(isLocalLeg(leg, course)).toBe(true);
    const r = calculateExpense(
      { courseId: "course-02", outbound: leg, inbound: { ...leg }, nights: 0 },
      { outbound: { fare: null }, inbound: { fare: null } },
    );
    expect(r.total).toBe(0);
    expect(r.shortDistance).toEqual({ outbound: true, inbound: true });
  });
});
