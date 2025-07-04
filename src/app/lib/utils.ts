import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function randomArraySort<T>(array?: T[]): T[] {
  if (!array) {
    return [];
  }

  const shuffled = [...array];

  // Fisher-Yates shuffle algorithm
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  return shuffled;
}

/**
 * Sorts an array alphabetically by a specified key
 * @param array - The array to sort
 * @param key - The key to sort by (defaults to 'name')
 * @returns A new sorted array
 */
export function alphabeticalSort<T>(array?: T[], key: keyof T = "name" as keyof T): T[] {
  if (!array) {
    return [];
  }

  return [...array].sort((a, b) => {
    const aValue = String(a[key] || "");
    const bValue = String(b[key] || "");
    return aValue.localeCompare(bValue);
  });
}

/**
 * Adds UTM parameters to external URLs only for tracking purposes
 * @param url - The URL to potentially add UTM parameters to
 * @param utmSource - The UTM source (defaults to 'la-meetup')
 * @param utmMedium - The UTM medium (defaults to 'owu')
 * @returns The URL with UTM parameters added only if it's an external link
 */
export function addUtmParams(
  url: string,
  utmSource: string = "la-meetup",
  utmMedium: string = "owu"
): string {
  // Don't add UTM params to hash-only links, empty URLs, or internal links
  if (!url || url === "#" || url.startsWith("#") || url.startsWith("/")) {
    return url;
  }

  // Only add UTM params to external URLs (starting with http/https)
  if (!url.startsWith("http")) {
    return url;
  }

  try {
    const urlObj = new URL(url);
    urlObj.searchParams.set("utm_source", utmSource);
    urlObj.searchParams.set("utm_medium", utmMedium);
    
    return urlObj.toString();
  } catch (error) {
    console.warn("Failed to add UTM parameters to URL:", url, error);
    return url;
  }
}
