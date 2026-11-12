import type { Metadata } from "next";
import { Archivo, Inter_Tight } from "next/font/google";
import "./globals.css";

// 본문·UI 글꼴(Inter Tight)과 제목·라벨용 가로폭 조절 글꼴(Archivo, wdth 축). 한글은 아래 fallback 글꼴이 맡는다.
const interTight = Inter_Tight({
  variable: "--font-inter-tight",
  subsets: ["latin"],
});

const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  axes: ["wdth"],
});

export const metadata: Metadata = {
  title: "스마트 교육여비 산출시스템",
  description: "교육 과정과 이동 정보를 입력하면 항목별 여비와 규정 근거를 확인할 수 있는 서비스",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className={`${interTight.variable} ${archivo.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
