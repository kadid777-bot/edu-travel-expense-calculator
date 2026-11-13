import Link from "next/link";
import AskBox from "../components/AskBox";
import CalculatorForm from "../components/CalculatorForm";
import FaqList from "../components/FaqList";

const NAV = [
  { href: "#calc", label: "계산하기" },
  { href: "#ask", label: "규정 질문" },
  { href: "#faq", label: "자주 묻는 질문" },
  { href: "/operator", label: "운영자" },
];

// 서비스 특징: 톤이 다른 큰 둥근 카드
const FACTS = [
  { big: "5", small: "항목별 금액과 근거 조항", bg: "var(--md-tertiary-container)" },
  { big: "LIVE", small: "철도 요금·거리·유가 실시간 조회", bg: "var(--md-tertiary-blue)" },
  { big: "AI", small: "규정 질의응답 (조항 인용)", bg: "var(--md-primary-container)" },
];

export default function Home() {
  return (
    <>
      {/* 위쪽 바: 가벼운 글자 메뉴 */}
      <nav aria-label="주 메뉴" className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-5 py-4">
        <Link href="/" className="text-[15px] font-medium">
          스마트 교육여비 계산기
        </Link>
        <ul className="flex flex-wrap items-center gap-1 text-[14px]">
          {NAV.map((n) => (
            <li key={n.href}>
              <Link href={n.href} className="rounded-full px-4 py-2 hover:bg-[var(--md-container-high)]">
                {n.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <div className="mx-auto w-full max-w-6xl space-y-3 px-3 pb-16 sm:px-4">
        {/* 히어로: 연한 분홍빛 큰 컨테이너, 아주 큰 제목 */}
        <header className="rounded-[28px] p-7 sm:p-12" style={{ background: "var(--md-container-low)" }}>
          <p className="text-[14px] text-[var(--md-on-surface-variant)]">교육 여비 계산 · 증빙 제출 · 규정 질문</p>
          <h1 className="hero-title mt-4 max-w-3xl">
            교육 여비,
            <br />
            근거와 함께 바로
          </h1>
          <p className="mt-6 max-w-xl text-[17px] leading-relaxed text-[var(--md-on-surface-variant)]">
            교육 과정과 이동 정보를 입력하면 항목별 여비와 규정 근거를 바로 확인할 수 있어요.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="#calc" className="md-btn md-btn-filled">
              내 여비 계산하기 <span aria-hidden="true">↓</span>
            </Link>
            <Link href="#ask" className="md-btn md-btn-tonal">
              규정 물어보기
            </Link>
          </div>
        </header>

        <ul className="grid gap-3 sm:grid-cols-3" aria-label="서비스 특징">
          {FACTS.map((f) => (
            <li key={f.big} className="rounded-[24px] p-6" style={{ background: f.bg, color: "var(--md-on-surface)" }}>
              <span className="block text-4xl font-medium">{f.big}</span>
              <span className="mt-2 block text-[14px] leading-snug">{f.small}</span>
            </li>
          ))}
        </ul>

        {/* 도구 영역: 큰 둥근 컨테이너 */}
        <main className="space-y-12 rounded-[28px] p-5 sm:p-10" style={{ background: "var(--md-container-low)" }}>
          <div id="calc" className="scroll-mt-6">
            <CalculatorForm />
          </div>
          <div id="ask" className="scroll-mt-6">
            <AskBox />
          </div>
          <div id="faq" className="scroll-mt-6">
            <FaqList />
          </div>
        </main>
      </div>
    </>
  );
}
