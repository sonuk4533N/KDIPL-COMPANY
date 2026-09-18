import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "KDIPL Operations Platform", template: "%s | KDIPL" },
  description:
    "Secure operations foundation for Kumar Designs India Private Limited.",
  manifest: "/manifest.webmanifest",
  applicationName: "KDIPL Operations",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "KDIPL",
  },
  other: { "mobile-web-app-capable": "yes" },
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await headers();
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
