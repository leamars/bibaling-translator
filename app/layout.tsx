import type { Metadata } from "next";
import "./styles.css";

export const metadata: Metadata = {
  title: "Bibaling — Book Workshop",
  description: "Write a family-loved bilingual version of a favorite book."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
