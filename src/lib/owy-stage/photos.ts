/** The La Meetup III gallery (public/images/conf/gallery); #10 was never published. */
export const MOMENT_PHOTOS = Array.from({ length: 30 }, (_, i) => i + 1)
  .filter((n) => n !== 10)
  .map((n) => `/images/conf/gallery/momento-${String(n).padStart(2, "0")}.webp`);
