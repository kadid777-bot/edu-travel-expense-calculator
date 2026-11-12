import AskBox from "../components/AskBox";
import CalculatorForm from "../components/CalculatorForm";
import { COURSES } from "../data/courses";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8 sm:py-12">
      <header className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">스마트 교육여비 산출시스템</h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">
          교육 과정과 이동 정보를 입력하면 항목별 여비와 규정 근거를 바로 확인할 수 있어요.
        </p>
      </header>
      <div className="space-y-12">
        <CalculatorForm courses={COURSES} />
        <AskBox />
      </div>
    </main>
  );
}
