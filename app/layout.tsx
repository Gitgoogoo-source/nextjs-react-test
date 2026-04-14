import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { TelegramAuthProvider } from "@/components/TelegramAuthProvider";
import Script from "next/script";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "TMA Game",
  description: "Telegram Mini App Game",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <Script
          src="https://telegram.org/js/telegram-web-app.js?59"
          strategy="beforeInteractive"
        />

        {/* Eruda 调试工具（移动端调试面板） */}
        <Script src="https://cdn.jsdelivr.net/npm/eruda" strategy="afterInteractive" />
        <Script id="eruda-init" strategy="afterInteractive">
          {`
            // 初始化调试面板
            if (typeof window !== 'undefined' && window.eruda) {
              window.eruda.init();

              // 这里的代码是为了防止图标被游戏画面挡住，强制置顶
              setTimeout(() => {
                var el = document.getElementById('eruda');
                if (el) {
                  el.style.zIndex = 999999;
                  el.style.position = 'absolute';
                }
              }, 2000);
            }
          `}
        </Script>
      </head>
      <body className="min-h-full flex flex-col bg-black text-white">
        <TelegramAuthProvider>
          {children}
        </TelegramAuthProvider>
      </body>
    </html>
  );
}
