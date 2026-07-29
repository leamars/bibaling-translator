import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Copyright and family use",
  description: "Bibaling is intended for private family reading and does not grant publication or distribution rights.",
  alternates: { canonical: "/copyright" }
};

export default function CopyrightPage() {
  return (
    <main className="legal-page">
      <p className="eyebrow">Copyright</p>
      <h1>Private family reading, not republication</h1>
      <p className="page-intro">Bibaling is designed to help a family privately read a book it already has in another family language.</p>
      <h2>Use material you may lawfully upload</h2><p>You must have the right to upload and process the book material. Ownership of a physical book does not automatically create rights to publish or distribute adaptations of it.</p>
      <h2>No new distribution rights</h2><p>Using Bibaling does not grant permission to publish, resell, share publicly, distribute, perform commercially, or create a commercial edition of the source book or its translation.</p>
      <h2>Keep the use private</h2><p>The intended use is a private family reading aid associated with a book your family already uses. If you want to publish, distribute, or use a translation beyond private family reading, obtain appropriate permission from the relevant rights holder.</p>
      <h2>Owner decision required before production</h2><p>A formal copyright complaint and takedown process, including the responsible legal contact, still needs to be established by the service owner.</p>
      <p>Copyright questions: <a href="mailto:hello@bibaling.com">hello@bibaling.com</a></p>
    </main>
  );
}
