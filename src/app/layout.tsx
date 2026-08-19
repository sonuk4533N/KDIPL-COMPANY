import type { Metadata } from "next";
import { DM_Sans, Manrope } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
});

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "KDIPL Operations Platform", template: "%s | KDIPL" },
  description:
    "Secure operations foundation for Kumar Designs India Private Limited.",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await headers();
  return (
    <html
      lang="en"
      className={`${dmSans.variable} ${manrope.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
