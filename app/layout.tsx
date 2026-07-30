import type { Metadata } from "next";
import "./styles.css";
import { SiteFooter, SiteHeader } from "./components/SiteChrome";

export const metadata: Metadata = {
  metadataBase: new URL("https://bibaling.com"),
  title: {
    default: "Bibaling — Read favorite books in your family’s language",
    template: "%s | Bibaling"
  },
  description: "Adapt children’s books into natural read-aloud language for bilingual family life.",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: "Bibaling",
    title: "Bibaling — Read favorite books in your family’s language",
    description: "Turn children’s books you already have into stories you can read naturally in your family’s language.",
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
