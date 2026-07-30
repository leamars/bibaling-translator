"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import AnalyticsPreference from "./AnalyticsPreference";
import TranslateLink from "./TranslateLink";

const primaryLinks = [
  ["/how-it-works", "How it works"],
  ["/languages", "Languages"],
  ["/guides", "Guides"]
] as const;

const legalLinks = [
  ["/privacy", "Privacy"],
  ["/terms", "Terms"],
  ["/copyright", "Copyright"]
] as const;

export function SiteHeader() {
  const pathname = usePathname();
  if (pathname === "/" || pathname === "/translate") return null;

  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link className="site-brand" href="/">bibaling</Link>
        <nav className="site-nav" aria-label="Main navigation">
          {primaryLinks.map(([href, label]) => <Link key={href} href={href}>{label}</Link>)}
        </nav>
        <TranslateLink className="site-cta" />
      </div>
    </header>
  );
}

export function SiteFooter() {
  const pathname = usePathname();
  if (pathname === "/" || pathname === "/translate") return null;

  return (
    <footer className="site-footer">
      <div className="site-footer-grid">
        <div>
          <Link className="site-brand" href="/">bibaling</Link>
          <p>Natural read-aloud translations for the books your family already loves.</p>
          <a href="mailto:hello@bibaling.com">hello@bibaling.com</a>
        </div>
        <nav aria-label="Footer navigation">
          {primaryLinks.map(([href, label]) => <Link key={href} href={href}>{label}</Link>)}
          {legalLinks.map(([href, label]) => <Link key={href} href={href}>{label}</Link>)}
          <AnalyticsPreference />
        </nav>
        <TranslateLink className="site-cta" />
      </div>
    </footer>
  );
}
