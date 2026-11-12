// Design Ref: §4.2 GET /api/courses — 교육 과정 목록
import { COURSES } from "../../../data/courses";

export async function GET() {
  return Response.json({ data: COURSES });
}
