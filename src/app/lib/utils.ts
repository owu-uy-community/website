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

/** The four standard UTM fields. Empty ones are skipped, so a link only carries what it means. */
export type UtmParams = {
  /** The property the click came from, not the page it came from */
  source?: string;
  /** The channel type. `referral` is the value analytics tools group under Referral traffic */
  medium?: string;
  /** The initiative the link belongs to, e.g. one edition of an event */
  campaign?: string;
  /** The placement inside the page, so two links to the same destination stay distinguishable */
  content?: string;
};

/**
 * Adds UTM parameters to external URLs only for tracking purposes
 * @param url - The URL to potentially add UTM parameters to
 * @param params - The UTM fields to append (defaults to the La Meetup source/medium pair)
 * @returns The URL with UTM parameters added only if it's an external link
 */
export function addUtmParams(
  url: string,
  { source = "la-meetup", medium = "owu", campaign, content }: UtmParams = {}
): string {
  // Don't add UTM params to hash-only links, empty URLs, or internal links:
  // tagging our own pages restarts the visit as a new session and loses the original source
  if (!url || url === "#" || url.startsWith("#") || url.startsWith("/")) {
    return url;
  }

  // Only add UTM params to external URLs (starting with http/https)
  if (!url.startsWith("http")) {
    return url;
  }

  try {
    const urlObj = new URL(url);
    const fields = {
      utm_source: source,
      utm_medium: medium,
      utm_campaign: campaign,
      utm_content: content,
    };

    for (const [key, value] of Object.entries(fields)) {
      // Lowercased: analytics tools report "Sponsors-Grid" and "sponsors-grid" as two placements
      if (value) urlObj.searchParams.set(key, value.trim().toLowerCase());
    }

    return urlObj.toString();
  } catch (error) {
    console.warn("Failed to add UTM parameters to URL:", url, error);
    return url;
  }
}

/**
 * Clamps a value between a minimum and maximum
 * @param value - The value to clamp
 * @param min - The minimum allowed value
 * @param max - The maximum allowed value
 * @returns The clamped value
 */
export function clampValue(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Calculates the stroke-dashoffset for an SVG progress ring
 * @param current - The current progress value
 * @param total - The total value (100%)
 * @param radius - The radius of the circle
 * @returns The calculated stroke-dashoffset value
 */
export function calculateProgressRing(current: number, total: number, radius: number): number {
  const circumference = 2 * Math.PI * radius;
  if (!(total > 0) || !Number.isFinite(current)) return 0;

  // Clamped: an out-of-range queue index or an overshooting timer would
  // otherwise produce a dash offset outside the circle and a broken ring.
  const progress = Math.min(1, Math.max(0, (total - current) / total));

  return circumference * progress;
}

/**
 * Gets class names for room selection state
 * @param isSelected - Whether the room is currently selected
 * @param baseColor - The base color for the room
 * @returns Class names for hover and selected states
 */
export function getRoomClassName(isSelected: boolean, baseColor: string): string {
  const hoverClass = `group-hover:fill-[${baseColor}] group-hover:stroke-[${baseColor}]`;
  const selectedClass = isSelected ? `fill-[${baseColor}] stroke-[${baseColor}]` : "";
  return cn("transition-all duration-300 ease-in-out", hoverClass, selectedClass);
}
