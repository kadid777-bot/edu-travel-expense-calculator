// Design Ref: §3.1 Course — 등록된 교육 과정(data/courses.ts) 또는 교육생이 직접 입력한 "기타" 과정을 하나의 Course로 바꾼다
import { COURSES } from "../../data/courses";
import type { Course, CustomCourseInput } from "./types";

export const CUSTOM_COURSE_ID = "custom";
export const CUSTOM_COURSE_LABEL = "기타 (직접 입력)";

/** 교육생이 입력한 "기타" 과정을 Course로 만든다. 입력 검사(schema.ts)를 통과한 값이어야 한다 */
export function customToCourse(c: CustomCourseInput): Course {
  return {
    id: CUSTOM_COURSE_ID,
    name: CUSTOM_COURSE_LABEL,
    venueName: `${c.venueSido} ${c.venueSigungu}`,
    venueAddress: `${c.venueSido} ${c.venueSigungu}`,
    venueSido: c.venueSido,
    venueSigungu: c.venueSigungu,
    startDate: c.startDate,
    endDate: c.endDate,
    lodgingProvided: c.lodgingProvided,
    mealsProvided: c.mealsProvided,
  };
}

/** 과정 id로 과정을 찾는다. id가 "custom"이면 직접 입력한 값을 쓴다. 없으면 null */
export function resolveCourse(courseId: string, custom?: CustomCourseInput): Course | null {
  if (courseId === CUSTOM_COURSE_ID) return custom ? customToCourse(custom) : null;
  return COURSES.find((c) => c.id === courseId) ?? null;
}
