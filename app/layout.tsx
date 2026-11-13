import type { Metadata } from "next";
import { Google_Sans } from "next/font/google";
import "./globals.css";

// Material 3 Expressive의 글꼴 Google Sans(가변). 한글은 globals.css의 fallback 글꼴이 맡는다.
const googleSans = Google_Sans({
  variable: "--font-google-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "스마트 교육여비 계산기",
  description: "교육 과정과 이동 정보를 입력하면 항목별 여비와 규정 근거를 확인할 수 있는 서비스",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className={`${googleSans.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
