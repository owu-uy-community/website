import { describe, expect, test } from "vitest";

import { HTML, MARKDOWN, preferredType } from "./negotiate";

const PAGE = [HTML, MARKDOWN];

describe(preferredType, () => {
  test("browsers and clients without a preference get HTML", () => {
    for (const accept of [
      null,
      "",
      "*/*",
      "text/*",
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    ]) {
      expect(preferredType(accept, PAGE)).toBe(HTML);
    }
  });

  test("agents that ask for Markdown get it", () => {
    for (const accept of [
      "text/markdown",
      "text/markdown; charset=utf-8",
      "text/markdown, text/html, */*",
      "text/html;q=0.5, text/markdown",
      "TEXT/MARKDOWN",
    ]) {
      expect(preferredType(accept, PAGE)).toBe(MARKDOWN);
    }
  });

  test("a tie in q goes to the range listed first", () => {
    expect(preferredType("text/html, text/markdown", PAGE)).toBe(HTML);
    expect(preferredType("text/markdown;q=0.8, text/html;q=0.8", PAGE)).toBe(MARKDOWN);
  });

  test("the most specific range wins over a wildcard, and q=0 rules a type out", () => {
    expect(preferredType("text/html;q=0, */*", PAGE)).toBe(MARKDOWN);
    expect(preferredType("text/markdown;q=0, */*;q=0.1", PAGE)).toBe(HTML);
  });

  test("null when the client accepts none of them", () => {
    expect(preferredType("application/pdf", PAGE)).toBeNull();
    expect(preferredType("text/html;q=0, text/markdown;q=0", PAGE)).toBeNull();
  });
});
