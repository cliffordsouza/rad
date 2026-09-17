import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Rad - Radix's social HR bot",
  description: "Rad admin & status",
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
