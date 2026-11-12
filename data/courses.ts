// Design Ref: §3.1 Course — 등록된 교육 과정 목록
// 실제 교육과 맞지 않던 실습용 과정을 모두 지웠다. 이제 교육생(운영자)이 교육 장소와 기간을 직접 입력한다(courseId "custom").
// 자주 쓰는 교육 장소는 data/venues.ts에서 고르면 시·도·시·군·구가 자동으로 채워진다.
// 이 목록은 비워 두고, 테스트에서만 채운다(tests/setup.ts). 과정을 미리 등록하고 싶으면 여기에 Course 항목을 추가하면 된다.
import type { Course } from "../lib/calc/types";

export const COURSES: Course[] = [];

export function getCourse(id: string): Course | undefined {
  return COURSES.find((c) => c.id === id);
}
