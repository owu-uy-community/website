export const HTML = "text/html";
export const MARKDOWN = "text/markdown";

type Range = { type: string; q: number; specificity: number };

function parseAccept(header: string): Range[] {
  return header
    .split(",")
    .map((raw) => {
      const [type = "", ...params] = raw.split(";").map((part) => part.trim());
      const qParam = params.find((param) => /^q\s*=/i.test(param));
      const q = qParam ? Number(qParam.split("=")[1]) : 1;

      return {
        type: type.toLowerCase(),
        q: Number.isNaN(q) ? 1 : Math.min(1, Math.max(0, q)),
        specificity: type === "*/*" ? 0 : type.endsWith("/*") ? 1 : 2,
      };
    })
    .filter((range) => range.type.includes("/"));
}

const matches = (range: Range, type: string) =>
  range.type === "*/*" ||
  range.type === type ||
  (range.type.endsWith("/*") && type.startsWith(range.type.slice(0, -1)));

/**
 * Which of `produces` to answer with, per the request's Accept header (RFC 9110 §12.5.1, as
 * acceptmarkdown.com spells it out): for each type, the most specific range that matches sets its
 * q, and q=0 rules it out; the highest q wins, a tie goes to the range the client listed first, then
 * to the order of `produces`. No header (or an unparseable one) means the first type; null means the
 * client accepts none of them.
 */
export function preferredType(accept: string | null, produces: readonly string[]): string | null {
  const ranges = parseAccept(accept ?? "");
  if (ranges.length === 0) return produces[0] ?? null;

  let best: { type: string; q: number; position: number } | null = null;

  for (const type of produces) {
    let match: Range | null = null;
    let position = -1;
    for (const [index, range] of ranges.entries()) {
      if (matches(range, type) && (!match || range.specificity > match.specificity)) {
        match = range;
        position = index;
      }
    }

    const q = match?.q ?? 0;
    if (q > 0 && (!best || q > best.q || (q === best.q && position < best.position))) {
      best = { type, q, position };
    }
  }

  return best?.type ?? null;
}
