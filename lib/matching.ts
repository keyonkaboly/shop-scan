// Shared match rules for the new-only retailers (SSENSE, and any retailer
// adapter added later), so every store agrees on what counts as "the GAT"
// and what counts as "your size".

// Retailers title the classic low-top GAT "Replica Sneakers", "Replica
// low-top sneakers", etc. — but high-tops, slip-ons and collabs reuse the
// same "Replica" name, and Margiela's Replica fragrance line does too, so a
// shoe word is required and the look-alikes are excluded explicitly rather
// than trusting "replica" alone.
const SHOE_PATTERN = /sneaker|trainer|\bgat\b|german army/;
const EXCLUDED_PATTERN = /\b(high|hi-top|mid|boots?|slip-on|slip on|mules?|sandals?|loafers?|ballet|ballerinas?|clogs?|reebok|salomon|converse|kids?)\b/;

export function isLowTopReplica(name: string): boolean {
  const lower = name.toLowerCase();
  const isReplica = lower.includes("replica") || /\bgat\b/.test(lower) || lower.includes("german army");
  return isReplica && SHOE_PATTERN.test(lower) && !EXCLUDED_PATTERN.test(lower);
}

// Reads an EU/IT size label ("IT 42", "EU 42.5", "42 1/2", "42½", "42") as a
// number. Anything labelled in another system ("US 9", "UK 8") returns null
// rather than being guessed at, since sizes are matched on EU/IT exactly.
export function parseEuSize(label: string): number | null {
  const normalized = label.trim().toUpperCase().replace(/\s*(½|1\/2)$/, ".5");
  const match = normalized.match(/^(?:(?:IT|EU)\s*)?(\d{2}(?:\.5)?)$/);
  return match ? Number(match[1]) : null;
}
