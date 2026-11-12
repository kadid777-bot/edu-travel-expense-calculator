// 테스트 준비: 앱에는 등록된 교육 과정이 없으므로, 테스트에서만 예전 실습용 과정 6개를 등록해 쓴다.
import { COURSES } from "../data/courses";
import { TEST_COURSES } from "./fixtures/courses";

if (COURSES.length === 0) COURSES.push(...TEST_COURSES);
