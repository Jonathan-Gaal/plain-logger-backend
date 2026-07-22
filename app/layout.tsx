import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Plain Logger",
  description: "Plain-language error log translator for Tier-2 Support Specialists",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
