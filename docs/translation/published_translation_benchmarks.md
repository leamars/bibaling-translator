# Published translation benchmarks

This registry gives Bibaling a small, source-backed set of professional
translation decisions to learn from. It is technique evidence, not a hidden
parallel-text corpus. The application currently selects records by target
language; it does not yet identify the uploaded book by title or ISBN.

## Prompt-ready registry

| Language | English book | Published edition | Evidence used | Prompt content |
| --- | --- | --- | --- | --- |
| German | *Llama Llama Red Pajama* | *Lama Lama im Pyjama*, Christiane Steen, Rowohlt Rotfuchs, ISBN 978-3-499-00080-5 | [Amazon customer images](https://www.amazon.co.uk/Lama-im-Pyjama-Anna-Dewdney/dp/3499000806#averageCustomerReviewsAnchor), [review excerpts](https://literaturwerkstattkreativblog.wordpress.com/2019/09/07/lama-lama-im-pyjama-von-anna-dewdney/), [ending review excerpt](https://www.knappenblog.at/2019/09/lama-lama-im-pyjama.html) | Four user-confirmed short passages plus technique notes |
| German | *The Gruffalo* | *Der Grüffelo*, Monika Osberghaus, Beltz & Gelberg | [Publisher record](https://www.beltz.de/kinderbuch_jugendbuch/produkte/details/717-der-grueffelo.html) | Metadata and technique notes only |
| Spanish | *Llama Llama Red Pajama* | *La llama llama rojo pijama*, ISBN 978-0-425-29039-2 | [Publisher catalogue](https://www.penguinrandomhouseretail.com/book/?isbn=9780425290392) | Metadata and technique notes only |
| Spanish | *The Gruffalo* | *El Grúfalo*, Bruño, ISBN 978-84-696-6327-1 | [Bookseller edition record](https://uae.kinokuniya.com/Julia_Donaldson_Books_in_Spanish_%3A_El_Grufalo/bw/9788469663271) | Metadata and technique notes only |
| Italian | *The Gruffalo* | *Il Gruffalò*, Emme Edizioni | [Library catalogue](https://www.culturabologna.it/objects/il-gruffalo-julia-donaldson-illustrato-da-axel-scheffler) | Metadata and technique notes only |
| Italian | *Room on the Broom* | *La strega Rossella*, Emme Edizioni, ISBN 978-88-6714-434-1 | [Library bibliography](https://www.sbhu.it/proposte-di-lettura/julia-donaldson/) | Metadata and technique notes only |
| Croatian | *The Gruffalo* | *Grubzon*, Krešimir Krnic | [Translator interview](https://miss7mama.24sata.hr/vrtic/stize-nastavak-grubzona-razgovarali-smo-s-prevoditeljem-koji-je-smislio-ime-slavnom-liku-19887) | Metadata and translator-described technique notes |
| Croatian | *The Gruffalo's Child* | *Grubzonovo dijete*, Krešimir Krnic | [Translator interview](https://miss7mama.24sata.hr/vrtic/stize-nastavak-grubzona-razgovarali-smo-s-prevoditeljem-koji-je-smislio-ime-slavnom-liku-19887) | Metadata and translator-described technique notes |
| Serbian | *The Gruffalo* | *Grozon* | [Edition review](https://lonacslikovnica.com/2019/07/07/grozon/) | Metadata and technique notes only |
| Serbian | *The Gruffalo's Child* | *Grozonovo dete* | [Edition review](https://lonacslikovnica.com/2019/07/07/grozon/) | Metadata and technique notes only |

The German *Lama Lama* record demonstrates the value of the layer. The
professional edition drops the low-priority adjective “red” and establishes
`Lama / Pyjama / Mama` as a highly productive recurring sound system. That is a
general translation technique. The quoted wording is not a phrase bank.

## Research queue

These records are discovery targets, not translation evidence. Nothing from
this table enters prompts until edition identity and the relevant technique are
confirmed by a publisher, library, translator, or a clearly legible limited
preview.

| Language | English book | Candidate local edition | Status |
| --- | --- | --- | --- |
| German | *Room on the Broom* | *Für Hund und Katz ist auch noch Platz* | Verify translator, publisher, and technique evidence |
| German | *The Snail and the Whale* | *Die Schnecke und der Buckelwal* | Verify translator and a public edition record |
| Spanish | *Room on the Broom* | *¡Cómo mola tu escoba!* | Verify regional edition and translator |
| Spanish | *The Snail and the Whale* | *El caracol y la ballena* | Separate Spain and Latin American editions |
| Italian | *The Snail and the Whale* | *La chiocciolina e la balena* | Verify translator and publisher record |
| Italian | *Stick Man* | *Bastoncino* | Verify translator and technique evidence |
| Croatian | *Room on the Broom* | Unknown/edition research needed | Explicit gap |
| Croatian | *The Snail and the Whale* | Unknown/edition research needed | Explicit gap |
| Serbian | *Room on the Broom* | Unknown/edition research needed | Explicit gap |
| Serbian | *The Snail and the Whale* | Unknown/edition research needed | Explicit gap |

## Evidence and acquisition rules

1. Start with publisher and national/library catalogue records to establish the
   edition title, translator, publisher, date, and ISBN.
2. Use bookseller listings and customer photos only to corroborate a known
   edition or inspect a small, clearly visible passage.
3. Use reviews, YouTube read-alouds, Reddit, and social posts as discovery
   leads. They do not become authoritative text merely because they are public.
4. Record the URL, evidence type, what it establishes, and confidence. Do not
   save full page transcriptions, ripped audio, or reconstructed books.
5. Quote only short passages that are necessary to document a specific
   technique and are user-supplied or independently public. Prefer technique
   notes over wording.
6. Keep prompt retrieval language-isolated. A German example must never appear
   in Spanish, Italian, Croatian, Serbian, or Slovenian prompts.
7. Require the model to follow the user's corrected English and illustrations,
   never to reproduce, continue, or infer unlisted copyrighted text.

## Next implementation step: title-aware retrieval

Language-only retrieval is intentionally conservative but still too broad. A
future flow should capture or infer the source book title after OCR, ask the
parent to confirm it, and retrieve an exact-title benchmark when available.
Unrelated books should receive only general language-pack guidance. Title-aware
matching should use normalized title/author/ISBN metadata, never fuzzy-match a
book solely because one page contains a similar phrase.
