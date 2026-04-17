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
      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <TelegramAuthProvider>
          {children}
        </TelegramAuthProvider>
      </body>
    </html>
  );
}
