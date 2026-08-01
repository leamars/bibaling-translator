import type { Metadata } from "next";
import Translator from "./Translator";

export const metadata: Metadata = {
  title: "Translate a children’s book",
  description: "Photograph an English children’s book and shape a natural read-aloud translation in your family’s language.",
  alternates: { canonical: "/translate" },
  openGraph: {
    title: "Translate a children’s book | Bibaling",
    description: "Shape a natural read-aloud version of an English book your family already loves.",
    url: "/translate"
  }
};

export default function TranslatePage() {
  return <Translator />;
}
