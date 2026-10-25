import { describe, expect, test } from "vitest";

import { photoSources, thumbSources } from "./image";

const FLICKR = "https://live.staticflickr.com/6113/6336036326_f2102b3f2b_c.jpg";
const MEETUP = "https://secure.meetupstatic.com/photos/event/2/c/8/0/highres_96191392.jpeg";

describe(photoSources, () => {
  test("lists Flickr's own sizes, so Flickr photos skip the optimizer", () => {
    const sources = photoSources(FLICKR, "50vw");
    expect(sources.src).toBe("https://live.staticflickr.com/6113/6336036326_f2102b3f2b_z.jpg");
    expect(sources.srcSet).toBe(
      [
        "https://live.staticflickr.com/6113/6336036326_f2102b3f2b_n.jpg 320w",
        "https://live.staticflickr.com/6113/6336036326_f2102b3f2b_w.jpg 400w",
        "https://live.staticflickr.com/6113/6336036326_f2102b3f2b_z.jpg 640w",
        "https://live.staticflickr.com/6113/6336036326_f2102b3f2b_c.jpg 800w",
        "https://live.staticflickr.com/6113/6336036326_f2102b3f2b_b.jpg 1024w",
      ].join(", ")
    );
    expect(sources.sizes).toBe("50vw");
  });

  test("sends single-size sources through the optimizer, at every width", () => {
    const sources = photoSources(MEETUP, "100vw");
    expect(sources.src).toContain("/_next/image?url=" + encodeURIComponent(MEETUP));
    expect(sources.srcSet).toContain("w=640");
    expect(sources.srcSet).toContain("w=1920");
  });
});

describe(thumbSources, () => {
  test("uses Flickr's squares", () => {
    expect(thumbSources(FLICKR, 24).src).toBe("https://live.staticflickr.com/6113/6336036326_f2102b3f2b_s.jpg");
    expect(thumbSources(FLICKR, 72).src).toBe("https://live.staticflickr.com/6113/6336036326_f2102b3f2b_q.jpg");
  });

  test("asks the optimizer for a small file, sharp on 2x screens", () => {
    const sources = thumbSources(MEETUP, 72);
    expect(sources.src).toContain("/_next/image?url=");
    expect(sources.srcSet).toMatch(/1x, .* 2x$/);
  });
});

describe("photoSources with optimize", () => {
  test("sends Flickr's largest size through the optimizer", () => {
    const sources = photoSources(FLICKR, "100vw", true);
    expect(sources.src).toContain(encodeURIComponent("https://live.staticflickr.com/6113/6336036326_f2102b3f2b_b.jpg"));
  });
});
