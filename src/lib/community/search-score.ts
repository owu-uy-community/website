const fold = (value: string) =>
  value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();

/**
 * Every word typed must appear somewhere (accents ignored); hits in the name
 * rank above hits in the description. cmdk's default fuzzy match is too loose
 * for prose: "segur" would match "suscribirte".
 */
export function scoreItem(value: string, search: string, keywords: string[] = []) {
  const words = fold(search).split(/\s+/).filter(Boolean);
  if (words.length === 0) return 1;
  const label = fold(value);
  const rest = fold(keywords.join(" "));
  if (!words.every((word) => label.includes(word) || rest.includes(word))) return 0;
  if (label.split(/\s+/).some((token) => token.startsWith(words[0]))) return 1;

  return words.some((word) => label.includes(word)) ? 0.75 : 0.4;
}
