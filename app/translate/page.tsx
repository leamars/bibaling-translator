import type { Metadata } from "next";
import Translator from "./Translator";

export const metadata: Metadata = {
  title: "Translate a children’s book",
  description: "Photograph a favorite children’s book and shape a natural English-to-Slovenian read-aloud translation.",
  alternates: { canonical: "/translate" },
  openGraph: {
    title: "Translate a children’s book | Bibaling",
    description: "Shape a natural English-to-Slovenian version of a book your family already loves.",
    url: "/translate"
  }
};

export default function TranslatePage() {
  return <Translator />;
}
