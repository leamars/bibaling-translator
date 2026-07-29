import Link from "next/link";
import TranslateLink from "./components/TranslateLink";

export default function NotFound() {
  return (
    <main className="not-found-page">
      <p className="eyebrow">Page not found</p>
      <h1>This page wandered out of the story.</h1>
      <p>Return home or begin a translation.</p>
      <div><Link className="secondary-link" href="/">Back home</Link><TranslateLink className="site-cta" /></div>
    </main>
  );
}
