import Link from "next/link";
import AskBox from "../components/AskBox";
import CalculatorForm from "../components/CalculatorForm";
import FaqList from "../components/FaqList";

const NAV = [
  { href: "#calc", label: "계산하기", active: true },
  { href: "#ask", label: "규정 질문" },
  { href: "#faq", label: "FAQ" },
  { href: "/operator", label: "운영자" },
];

const FACTS = [
  { big: "5", small: "항목별 금액과 근거 조항" },
  { big: "LIVE", small: "철도 요금·거리·유가 실시간 조회" },
  { big: "AI", small: "규정 질의응답 (조항 인용)" },
];

export default function Home() {
  return (
    <>
      {/* 히어로: 종이색 배경 + 큰 제목 */}
      <header className="relative overflow-hidden" style={{ background: "var(--background)", color: "var(--foreground)" }}>
        <div className="hero-pad mx-auto px-4" style={{ maxWidth: "calc(1440 * var(--u))" }}>
          <div className="flex items-center justify-between gap-4">
            <nav aria-label="주 메뉴" className="flex flex-wrap rounded-full bg-white p-1 text-[13px] sm:text-[15px]" style={{ height: "auto" }}>
              {NAV.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  aria-current={n.active ? "page" : undefined}
                  className={`rounded-full px-4 py-2.5 transition-colors ${n.active ? "bg-black text-white" : "hover:bg-black hover:text-white"}`}
                >
                  {n.label}
                </Link>
              ))}
            </nav>
            <Link href="/operator" className="lift hidden rounded-full bg-black px-5 py-3 text-[14px] text-white sm:inline-block">
              운영자 일괄 산출 ↗
            </Link>
          </div>

          <h1 className="display hero-title hero-gap">스마트 교육여비 계산기</h1>

          <div className="mt-8 grid gap-10 md:grid-cols-[1.3fr_1fr] md:items-end">
            <div>
              <p className="mt-6 max-w-md text-[15px] leading-relaxed">
                교육 과정과 이동 정보를 입력하면 항목별 여비와 규정 근거를 바로 확인할 수 있어요.
              </p>
              <Link href="#calc" className="lift mt-6 inline-block rounded-full bg-black px-6 py-3 text-[14px] text-white">
                내 여비 계산하기 ↓
              </Link>
            </div>
            <ul className="grid grid-cols-3 gap-3 md:grid-cols-1" aria-label="서비스 특징">
              {FACTS.map((f) => (
                <li key={f.big} className="rounded-xl bg-[#cdcdcd] p-4 text-black md:flex md:items-baseline md:gap-4">
                  <span className="display block text-3xl md:text-4xl">{f.big}</span>
                  <span className="mt-2 block text-[12px] leading-snug md:mt-0 md:text-[13px]">{f.small}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </header>

      {/* 검은 띠 */}
      <div className="bar-label flex items-center justify-between gap-3 border-b px-4 text-white" style={{ background: "var(--black)", borderColor: "rgba(255,255,255,0.14)", height: "calc(111 * var(--u))", minHeight: 56 }} aria-hidden="true">
        <span>
          EST <span style={{ color: "var(--grey-fill)" }}>2026</span>
        </span>
        <span className="flex items-center gap-3">
          SCROLL DOWN
          <span className="grid h-7 w-7 place-items-center rounded-full bg-white text-black">↓</span>
        </span>
        <span className="hidden sm:inline" style={{ color: "var(--grey-fill)" }}>
          LIVE IN DETAILS
        </span>
      </div>

      {/* 도구 영역: 검은 배경 위의 테두리 있는 패널 */}
      <div className="tool-pad-bottom px-3 pt-8 sm:px-4 sm:pt-12" style={{ background: "var(--black)" }}>
        <main
          className="mx-auto w-full max-w-3xl space-y-12 rounded-[14px] border p-5 sm:p-8"
          style={{ background: "var(--panel)", color: "var(--foreground)", borderColor: "var(--hairline)" }}
        >
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
