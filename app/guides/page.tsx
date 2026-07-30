import type { Metadata } from "next";
import TranslateLink from "../components/TranslateLink";

export const metadata: Metadata = {
  title: "Guides for bilingual family reading",
  description: "Practical guidance for photographing books, reading in a family language, and using private family translations.",
  alternates: { canonical: "/guides" }
};

export default function GuidesPage() {
  return (
    <main className="content-page guides-page">
      <p className="eyebrow">Guides</p>
      <h1>Make familiar books easier to share in another language.</h1>
      <p className="page-intro">Three practical guides for the part that happens around the translation: choosing a reading style, making legible photos, and keeping an editable version with the physical book.</p>
      <article><h2>Reading an existing book in your family language</h2><p>Begin with the emotional job of the page rather than each English word. Notice who is speaking, what changes in the picture, and where your child expects a pause or repeated response. Keep names and recurring phrases consistent. If a joke cannot travel directly, preserve what makes it funny instead of preserving English syntax.</p><p>Read a draft aloud before writing it down. A sentence that looks elegant can still be difficult to say while holding a book and watching a child.</p></article>
      <article><h2>Photographing pages clearly</h2><p>Photograph the full open spread, including both outside edges. Use soft, even light and hold the camera parallel to the book. Avoid fingers over text, glare on coated paper, deep shadows near the binding, and cropped page corners. Check the photo at full size before continuing; if you cannot comfortably read a line, the system may not either.</p><p>Upload pages in small groups when establishing the voice, then add the remaining spreads and arrange them in reading order.</p></article>
      <article><h2>Keeping translations with a physical book</h2><p>Print an edited draft in a legible type size, keeping page numbers beside each translation. Removable notes, an insert kept inside the cover, or a separate reading booklet avoid permanently altering the original. Keep the English visible when it helps another caregiver follow along.</p><p>Review every line first. Machine-assisted language can contain errors, and the parent is the final editor.</p></article>
      <TranslateLink className="site-cta large" />
    </main>
  );
}
