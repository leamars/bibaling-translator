import type { Metadata } from "next";
import "./styles.css";
import "./homepage.css";
import { SiteFooter, SiteHeader } from "./components/SiteChrome";

export const metadata: Metadata = {
  metadataBase: new URL("https://bibaling.com"),
  title: {
    default: "Bibaling — Read their favourite books in your language",
    template: "%s | Bibaling"
  },
  description: "Bibaling translates the children’s books you already have, keeping the rhythm, rhyme and playfulness that make them fun to read aloud.",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: "Bibaling",
    title: "Bibaling — Read their favourite books in your language",
    description: "Bibaling translates the children’s books you already have, keeping the rhythm, rhyme and playfulness that make them fun to read aloud.",
    url: "/"
  }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <SiteHeader />
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
