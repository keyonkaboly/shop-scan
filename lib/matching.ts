// Shared match rules for every source, so all stores agree on what counts as
// "the GAT" and what counts as "your size".

// Only the classic low-top Replica/GAT counts. High-tops, other Replica-line
// models (Runner, Retro, Super Bounce/"Bubble" sole, Sock, Hybrid, strap and
// velcro versions), Tabi, Future, MM6, collabs and kids' sizes all reuse the
// "Replica"/"GAT" name, so they're excluded explicitly rather than trusting
// the name alone.
const MODEL_PATTERN = /replica|\bgats?\b|german army/;
const EXCLUDED_PATTERN = /\b(high|high-?tops?|hi-?tops?|hightops?|mid|mid-?top|retro|runners?|super ?bounce|bounce|bubble|sock|hybrid|straps?|velcro|hook|wrestler|tabi|future|sprinters?|mm6|kids?|reebok|salomon|converse|slip-?ons?|slip on|boots?|mules?|sandals?|loafers?|ballet|ballerinas?|clogs?)\b/;

// Marketplace titles (eBay, Grailed): the listing's category already says
// it's a sneaker, so only the model has to be right.
export function isGatTitle(title: string): boolean {
  const lower = title.toLowerCase();
  return MODEL_PATTERN.test(lower) && !EXCLUDED_PATTERN.test(lower);
}

// Retailer product names: Margiela's Replica fragrance line shares the name,
// so a shoe word is required as well.
const SHOE_PATTERN = /sneaker|trainer|\bgat\b|german army/;
export function isLowTopReplica(name: string): boolean {
  return isGatTitle(name) && SHOE_PATTERN.test(name.toLowerCase());
}

// Reads a retailer's EU/IT size label ("IT 42", "EU 42.5", "42 1/2", "42½",
// "42") as a number. Anything labelled in another system ("US 9", "UK 8")
// returns null rather than being guessed at.
export function parseEuSize(label: string): number | null {
  const normalized = label.trim().toUpperCase().replace(/\s*(½|1\/2)$/, ".5");
  const match = normalized.match(/^(?:(?:IT|EU)\s*)?(\d{2}(?:\.5)?)$/);
  return match ? Number(match[1]) : null;
}

// Margiela sizes natively in IT/EU. Its charts put men's US at IT − 33 (IT 42
// = US 9) and women's US at IT − 30 (IT 38 = US W 8) — sellers' own "Women's
// US10 / EU40"-style titles match this. Everything on the site is shown as
// IT plus the men's US equivalent.
export const MENS_US_OFFSET = 33;
const WOMENS_US_OFFSET = 30;
const UK_OFFSET = 34;
const WOMENS_PATTERN = /\b(women'?s?|womens|wmns|ladies)\b|\bus\s*w\s*\d/;

const isHalfStep = (value: number) => Number.isInteger(value * 2);
const unique = (values: number[]) => [...new Set(values)];

function collect(text: string, pattern: RegExp, min: number, max: number): number[] {
  return [...text.matchAll(pattern)].map((match) => Number(match[1])).filter((value) => value >= min && value <= max && isHalfStep(value));
}

// Resolves a marketplace listing to one IT size, or null when it can't be
// told reliably. An explicit EU/IT size in the title wins — it's Margiela's
// own sizing and what sellers most often get right — then a US (or UK) size
// in the title, then the marketplace's own size field. US sizes are read as
// women's when the listing is in a women's department or says so. Titles
// naming two different sizes (e.g. "fits 42-43") are too ambiguous to use.
export function resolveItSize(title: string, options: { usSize?: string | number | null; womens?: boolean } = {}): number | null {
  const text = title.toLowerCase().replace(/½/g, ".5").replace(/(\d)\s+1\/2\b/g, "$1.5").replace(/(\d),5\b/g, "$1.5");
  const womens = Boolean(options.womens) || WOMENS_PATTERN.test(text);

  const euSizes = unique([
    ...collect(text, /\b(?:eu|it|euro|ita)\s*[:#.]?\s*(\d{2}(?:\.5)?)(?![\d.])/g, 34, 48),
    ...collect(text, /(?<![\d.])(\d{2}(?:\.5)?)\s*(?:eu|it)\b/g, 34, 48),
    // Any other stand-alone 34–48 is an EU size in a shoe title ("size 42",
    // "(42)", "Trainer White 41") — US and UK sizes never go that high.
    ...collect(text, /(?<![\w.])(\d{2}(?:\.5)?)(?![\w.])/g, 34, 48),
  ]);
  if (euSizes.length > 1) return null;
  if (euSizes.length === 1) return euSizes[0];

  const usSizes = unique([
    ...collect(text, /\bus\s*[mw]?\s*(\d{1,2}(?:\.5)?)(?![\d.])/g, 3, 16),
    ...collect(text, /\b(?:size|sz|men'?s|mens|women'?s|womens|wmns)\s*[:#.]?\s*(\d{1,2}(?:\.5)?)(?![\d.])/g, 3, 16),
  ]);
  if (usSizes.length > 1) return null;
  if (usSizes.length === 1) return usSizes[0] + (womens ? WOMENS_US_OFFSET : MENS_US_OFFSET);

  const ukSizes = unique(collect(text, /\buk\s*(\d{1,2}(?:\.5)?)(?![\d.])/g, 2, 14));
  if (ukSizes.length === 1) return ukSizes[0] + UK_OFFSET;

  const fieldSize = Number(options.usSize);
  if (options.usSize != null && Number.isFinite(fieldSize) && fieldSize >= 3 && fieldSize <= 16 && isHalfStep(fieldSize)) {
    return fieldSize + (womens ? WOMENS_US_OFFSET : MENS_US_OFFSET);
  }
  return null;
}
