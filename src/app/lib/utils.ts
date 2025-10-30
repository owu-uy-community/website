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
export function addUtmParams(url: string, utmSource: string = "la-meetup", utmMedium: string = "owu"): string {
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
  const progress = total > 0 ? (total - current) / total : 0;
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
