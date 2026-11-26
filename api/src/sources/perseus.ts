// Perseus, through the Perseids CTS resolver.
//
// The right tool for "a fragment of ancient text": canonical Greek and Latin
// with stable URNs, and facing translations where an edition exists.
//
// Editions are DISCOVERED rather than hardcoded. The suffix that carries a work
// varies per text — Thucydides' English is `perseus-eng4`, Herodotus' is
// `perseus-eng2`, Sallust's Latin is `perseus-lat3` — so guessing produces a
// verification failure on a citation that is perfectly real. GetCapabilities
// costs one extra request, is cached with the source, and is always right.

import { getText, xmlToText } from "./http";
import { TRUST, type SourceCandidate, type SourceClaim, type SourceProvider } from "./types";

const CTS = "https://cts.perseids.org/api/cts/";
const READER = "https://scaife.perseus.org/reader";

type Work = {
  /** CTS work identifier, e.g. "tlg0003.tlg001". */
  id: string;
  corpus: "greekLit" | "latinLit";
  author: string;
  title: string;
  /** Lowercase strings that should resolve to this work, in any language. */
  aliases: string[];
};

/**
 * Curated catalog of the works a humanities or classics path actually cites.
 * Every entry was confirmed to resolve against the live resolver; a work that
 * is not here simply fails to verify and the chain moves on to Wikisource.
 */
const CATALOG: Work[] = [
  // Greek
  { id: "tlg0012.tlg001", corpus: "greekLit", author: "Homer", title: "Iliad",
    aliases: ["iliad", "ilíada", "iliada", "ilias"] },
  { id: "tlg0012.tlg002", corpus: "greekLit", author: "Homer", title: "Odyssey",
    aliases: ["odyssey", "odisea", "odyssee", "odyssea"] },
  { id: "tlg0020.tlg001", corpus: "greekLit", author: "Hesiod", title: "Theogony",
    aliases: ["theogony", "teogonía", "teogonia"] },
  { id: "tlg0016.tlg001", corpus: "greekLit", author: "Herodotus", title: "Histories",
    aliases: ["histories", "historias", "historiae", "the histories"] },
  { id: "tlg0003.tlg001", corpus: "greekLit", author: "Thucydides",
    title: "History of the Peloponnesian War",
    aliases: ["history of the peloponnesian war", "peloponnesian war", "guerra del peloponeso",
      "historia de la guerra del peloponeso", "history"] },
  { id: "tlg0032.tlg006", corpus: "greekLit", author: "Xenophon", title: "Anabasis",
    aliases: ["anabasis", "anábasis"] },
  { id: "tlg0032.tlg002", corpus: "greekLit", author: "Xenophon", title: "Memorabilia",
    aliases: ["memorabilia", "recuerdos de sócrates"] },
  { id: "tlg0059.tlg002", corpus: "greekLit", author: "Plato", title: "Apology",
    aliases: ["apology", "apología", "apologia", "apology of socrates"] },
  { id: "tlg0059.tlg004", corpus: "greekLit", author: "Plato", title: "Phaedo",
    aliases: ["phaedo", "fedón", "fedon"] },
  { id: "tlg0059.tlg011", corpus: "greekLit", author: "Plato", title: "Symposium",
    aliases: ["symposium", "banquete", "el banquete"] },
  { id: "tlg0059.tlg030", corpus: "greekLit", author: "Plato", title: "Republic",
    aliases: ["republic", "república", "republica", "the republic"] },
  { id: "tlg0011.tlg002", corpus: "greekLit", author: "Sophocles", title: "Antigone",
    aliases: ["antigone", "antígona", "antigona"] },
  { id: "tlg0011.tlg004", corpus: "greekLit", author: "Sophocles", title: "Oedipus Tyrannus",
    aliases: ["oedipus tyrannus", "oedipus rex", "oedipus the king", "edipo rey"] },
  { id: "tlg0085.tlg005", corpus: "greekLit", author: "Aeschylus", title: "Agamemnon",
    aliases: ["agamemnon", "agamenón", "agamenon"] },
  { id: "tlg0006.tlg003", corpus: "greekLit", author: "Euripides", title: "Medea",
    aliases: ["medea"] },
  { id: "tlg0019.tlg002", corpus: "greekLit", author: "Aristophanes", title: "Clouds",
    aliases: ["clouds", "the clouds", "nubes", "las nubes"] },
  { id: "tlg0014.tlg018", corpus: "greekLit", author: "Demosthenes", title: "On the Crown",
    aliases: ["on the crown", "de corona", "sobre la corona"] },
  { id: "tlg0525.tlg001", corpus: "greekLit", author: "Pausanias", title: "Description of Greece",
    aliases: ["description of greece", "descripción de grecia"] },

  // Latin
  { id: "phi0448.phi001", corpus: "latinLit", author: "Caesar", title: "Gallic War",
    aliases: ["gallic war", "de bello gallico", "bellum gallicum", "guerra de las galias"] },
  { id: "phi0474.phi013", corpus: "latinLit", author: "Cicero", title: "In Catilinam",
    aliases: ["in catilinam", "catilinarians", "against catiline", "catilinarias"] },
  { id: "phi0474.phi055", corpus: "latinLit", author: "Cicero", title: "De Officiis",
    aliases: ["de officiis", "on duties", "sobre los deberes"] },
  { id: "phi0690.phi003", corpus: "latinLit", author: "Virgil", title: "Aeneid",
    aliases: ["aeneid", "aeneis", "eneida"] },
  { id: "phi0893.phi001", corpus: "latinLit", author: "Horace", title: "Odes",
    aliases: ["odes", "carmina", "odas"] },
  { id: "phi0959.phi006", corpus: "latinLit", author: "Ovid", title: "Metamorphoses",
    aliases: ["metamorphoses", "metamorfosis"] },
  { id: "phi0631.phi001", corpus: "latinLit", author: "Sallust", title: "Catiline's War",
    aliases: ["catiline's war", "bellum catilinae", "de coniuratione catilinae",
      "conjuración de catilina"] },
  { id: "phi0550.phi001", corpus: "latinLit", author: "Lucretius", title: "De Rerum Natura",
    aliases: ["de rerum natura", "on the nature of things", "de la naturaleza de las cosas"] },
  { id: "phi0472.phi001", corpus: "latinLit", author: "Catullus", title: "Carmina",
    aliases: ["carmina", "poems", "poemas"] },
  { id: "phi1017.phi005", corpus: "latinLit", author: "Seneca", title: "Epistulae Morales",
    aliases: ["epistulae morales", "moral letters", "cartas a lucilio", "letters"] },
  { id: "phi1348.abo011", corpus: "latinLit", author: "Suetonius", title: "Lives of the Caesars",
    aliases: ["lives of the caesars", "de vita caesarum", "twelve caesars", "vidas de los césares"] },
];

/** Author names as they appear in other languages, folded to the catalog's form. */
const AUTHOR_ALIASES: Record<string, string> = {
  homero: "homer", homerus: "homer",
  hesíodo: "hesiod", hesiodo: "hesiod",
  heródoto: "herodotus", herodoto: "herodotus", herodot: "herodotus",
  tucídides: "thucydides", tucidides: "thucydides", thukydides: "thucydides",
  jenofonte: "xenophon",
  platón: "plato", platon: "plato",
  sófocles: "sophocles", sofocles: "sophocles",
  esquilo: "aeschylus",
  eurípides: "euripides", euripides: "euripides",
  aristófanes: "aristophanes", aristofanes: "aristophanes",
  demóstenes: "demosthenes", demostenes: "demosthenes",
  césar: "caesar", cesar: "caesar", "julius caesar": "caesar", "julio césar": "caesar",
  cicerón: "cicero", ciceron: "cicero",
  virgilio: "virgil", vergil: "virgil", vergilius: "virgil",
  horacio: "horace", horatius: "horace",
  ovidio: "ovid", ovidius: "ovid",
  salustio: "sallust",
  lucrecio: "lucretius",
  catulo: "catullus", catulus: "catullus",
  séneca: "seneca",
  suetonio: "suetonius",
  pausanias: "pausanias",
};

function fold(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** The catalog entry a claim names, or null when the corpus does not hold it. */
export function resolveWork(claim: SourceClaim): Work | null {
  const authorRaw = fold(claim.author ?? "");
  const author = fold(AUTHOR_ALIASES[authorRaw] ?? authorRaw);
  const work = fold(claim.work ?? "");
  if (!author && !work) return null;

  const byAuthor = CATALOG.filter(
    (w) => author !== "" && (fold(w.author) === author || author.includes(fold(w.author))),
  );
  const pool = byAuthor.length > 0 ? byAuthor : CATALOG;

  const matched = pool.find((w) =>
    work !== "" && (fold(w.title) === work || w.aliases.some((a) => fold(a) === work)),
  );
  if (matched) return matched;

  const partial = pool.find((w) =>
    work !== "" && (work.includes(fold(w.title)) || w.aliases.some((a) => work.includes(fold(a)))),
  );
  if (partial) return partial;

  // An author with exactly one work in the catalog needs no title to be certain.
  return byAuthor.length === 1 ? byAuthor[0] : null;
}

/** Language codes as they appear in a CTS edition suffix. */
const LANGUAGE_CODES: Record<string, string> = {
  english: "eng", spanish: "spa", french: "fre", german: "ger", italian: "ita",
  portuguese: "por", dutch: "dut",
};

type Editions = { original: string | null; translations: Map<string, string> };

/** Which editions of a work this resolver actually holds. */
async function listEditions(corpus: string, workId: string): Promise<Editions> {
  const workUrn = `urn:cts:${corpus}:${workId}`;
  const xml = await getText(`${CTS}?request=GetCapabilities&urn=${encodeURIComponent(workUrn)}`, {
    timeoutMs: 8000,
  });
  const result: Editions = { original: null, translations: new Map() };
  if (!xml) return result;

  const pattern = new RegExp(`${workId.replace(/\./g, "\\.")}\\.[A-Za-z0-9-]+`, "g");
  const suffixes = [...new Set(xml.match(pattern) ?? [])];
  const originalCode = corpus === "greekLit" ? "grc" : "lat";

  for (const full of suffixes) {
    const suffix = full.slice(workId.length + 1).toLowerCase();
    const urn = `urn:cts:${corpus}:${full}`;
    if (suffix.includes(originalCode)) {
      // A later edition number is the more recent text; prefer it.
      if (!result.original || full > result.original) result.original = urn;
      continue;
    }
    for (const code of new Set(Object.values(LANGUAGE_CODES))) {
      if (suffix.includes(code) && !result.translations.has(code)) {
        result.translations.set(code, urn);
      }
    }
  }
  return result;
}

/**
 * Loci are edition-specific and students cite them loosely. A handful of shapes
 * covers the real variation without ever silently fetching a DIFFERENT passage
 * than the one claimed.
 */
function locusVariants(locus: string): string[] {
  const trimmed = locus.trim().replace(/\s+/g, "");
  if (trimmed === "") return [];
  const out = new Set<string>([trimmed]);
  out.add(trimmed.replace(/[,;]/g, "."));
  // "Book 1, chapter 22" and the like, reduced to the numeric path.
  const numbers = locus.match(/\d+[a-e]?/gi);
  if (numbers && numbers.length > 0) out.add(numbers.join("."));
  return [...out];
}

async function fetchPassage(editionUrn: string, locus: string): Promise<string | null> {
  const urn = `${editionUrn}:${locus}`;
  const xml = await getText(`${CTS}?request=GetPassage&urn=${encodeURIComponent(urn)}`, {
    timeoutMs: 8000,
  });
  if (!xml) return null;
  const start = xml.indexOf("<TEI");
  if (start === -1) return null;
  const text = xmlToText(xml.slice(start));
  return text.length > 20 ? text : null;
}

export function createPerseusProvider(nativeLanguage = "english"): SourceProvider {
  const wanted = LANGUAGE_CODES[nativeLanguage.toLowerCase()] ?? "eng";

  return {
    id: "perseus",
    // Perseus texts are public domain or openly licensed, so the retrieved text
    // may be cached in the shared collection and shown in full.
    cacheText: true,

    async verify(claim: SourceClaim): Promise<SourceCandidate | null> {
      const work = resolveWork(claim);
      if (!work) return null;

      const editions = await listEditions(work.corpus, work.id);
      if (!editions.original) return null;

      const base = {
        provider: "perseus" as const,
        author: work.author,
        work: work.title,
        date: claim.date,
        lang: work.corpus === "greekLit" ? "grc" : "lat",
        license: "CC BY-SA 3.0 / public domain",
      };

      for (const locus of locusVariants(claim.locus ?? "")) {
        const text = await fetchPassage(editions.original, locus);
        if (!text) continue;

        const translationUrn = editions.translations.get(wanted) ?? editions.translations.get("eng");
        const translation = translationUrn ? await fetchPassage(translationUrn, locus) : null;

        return {
          ...base,
          externalId: `${editions.original}:${locus}`,
          locus,
          text,
          translation,
          url: `${READER}/${editions.original}:${locus}/`,
          trust: TRUST.canonical,
        };
      }

      // The work is real but the citation did not resolve. Returning metadata
      // rather than null gives the student a citation they can follow, and is
      // the whole reason this pipeline exists: no invented quotation, ever.
      return {
        ...base,
        externalId: editions.original,
        locus: claim.locus,
        text: null,
        translation: null,
        url: `${READER}/${editions.original}/`,
        trust: TRUST.metadata,
      };
    },

    async search(query: string): Promise<SourceCandidate[]> {
      // The catalog is the index: a free-text search over a fixed corpus is just
      // a claim with no locus.
      const candidate = await this.verify({ work: query, author: query });
      return candidate ? [candidate] : [];
    },
  };
}
