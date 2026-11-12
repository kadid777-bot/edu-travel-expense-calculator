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

describe("시내 판정 보강", () => {
  const course = () => getCourse("course-02")!; // 부산 남구
  const bus = (sigungu: string, sido = "부산광역시") => ({ sido, sigungu, transport: "bus" as const, transportActual: 20000 });

  it("광역시 안의 군(기장군)은 별도 시·군이라 시내가 아니다", () => {
    expect(isLocalLeg(bus("기장군"), course())).toBe(false);
  });

  it("한 구간만 시내면 그 구간 교통비만 0원이고 숙박·식비는 지급한다", () => {
    const r = calculateExpense(
      { courseId: "course-02", outbound: bus("해운대구"), inbound: bus("기장군"), nights: 0 },
      { outbound: { fare: null }, inbound: { fare: 30000 } },
    );
    expect(r.shortDistance).toEqual({ outbound: true, inbound: false });
    expect(r.items[0].approved).toBe(0);
    expect(r.items[1].approved).toBe(20000);
    expect(r.items.find((i) => i.category === "식비")!.approved).toBeGreaterThan(0);
  });

  it("0박인데 숙박비 실비를 보내도 숙박비는 0원이다", () => {
    const r = calculateExpense(
      { courseId: "course-02", outbound: bus("기장군"), inbound: bus("기장군"), nights: 0, lodgingActuals: [80000] },
      { outbound: { fare: 30000 }, inbound: { fare: 30000 } },
    );
    expect(r.items.find((i) => i.category === "숙박비")!.approved).toBe(0);
  });

  it("대표역이 같거나 요금 정보가 없으면 이유를 구분해서 경고한다", () => {
    const mk = (fareReason: "same-station" | "not-found" | "no-station") =>
      calculateExpense(
        { courseId: "course-02", outbound: bus("기장군"), inbound: bus("기장군"), nights: 0 },
        { outbound: { fare: null, fareReason }, inbound: { fare: 1000 } },
      ).warnings[0];
    expect(mk("same-station")).toContain("대표 철도역이 같아");
    expect(mk("not-found")).toContain("직통 열차가 없을 수 있습니다");
    expect(mk("no-station")).toContain("근처에 열차 구간이 없어");
  });
});
