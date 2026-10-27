import { describe, expect, test } from "vitest";

import { avatarSources, photoSources, thumbSources, youtubeId } from "./image";

const FLICKR = "https://live.staticflickr.com/6113/6336036326_f2102b3f2b_c.jpg";
const MEETUP = "https://secure.meetupstatic.com/photos/event/2/c/8/0/highres_96191392.jpeg";
const GITHUB = "https://raw.githubusercontent.com/ember-montevideo/meetups/master/fotos/01.jpg";
const at = (prefix: string) => `https://secure.meetupstatic.com/photos/event/2/c/8/0/${prefix}96191392.webp`;

describe(photoSources, () => {
  test("lists Flickr's own sizes", () => {
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

  test("lists Meetup's own sizes, as WebP, straight from its CDN", () => {
    const sources = photoSources(MEETUP, "100vw");
    expect(sources.src).toBe(at("highres_"));
    expect(sources.srcSet).toBe(
      [
        `${at("thumb_")} 80w`,
        `${at("global_")} 180w`,
        `${at("event_")} 360w`,
        `${at("600_")} 600w`,
        `${at("highres_")} 1200w`,
      ].join(", ")
    );
    expect(sources.srcSet).not.toContain("/_next/image");
  });

  test("leaves single-size sources as they are", () => {
    expect(photoSources(GITHUB, "100vw")).toStrictEqual({ src: GITHUB });
  });
});

describe(thumbSources, () => {
  test("uses Flickr's squares", () => {
    expect(thumbSources(FLICKR, 24).src).toBe("https://live.staticflickr.com/6113/6336036326_f2102b3f2b_s.jpg");
    expect(thumbSources(FLICKR, 72).src).toBe("https://live.staticflickr.com/6113/6336036326_f2102b3f2b_q.jpg");
  });

  test("picks Meetup sizes that cover the square, sharp on 2x screens", () => {
    expect(thumbSources(MEETUP, 72)).toStrictEqual({
      src: at("global_"),
      srcSet: `${at("global_")} 1x, ${at("event_")} 2x`,
    });
    expect(thumbSources(MEETUP, 160)).toStrictEqual({
      src: at("event_"),
      srcSet: `${at("event_")} 1x, ${at("600_")} 2x`,
    });
  });

  test("leaves single-size sources as they are", () => {
    expect(thumbSources(GITHUB, 72)).toStrictEqual({ src: GITHUB });
  });
});

describe(avatarSources, () => {
  const MEMBER = "https://secure.meetupstatic.com/photos/member/3/e/f/8/highres_274396120.jpeg";
  const member = (prefix: string) => `https://secure.meetupstatic.com/photos/member/3/e/f/8/${prefix}274396120.webp`;

  test("takes Meetup's 80px square while it's sharp, its 240px one past that", () => {
    expect(avatarSources(MEMBER, 32)).toStrictEqual({ src: member("thumb_") });
    expect(avatarSources(MEMBER, 44)).toStrictEqual({
      src: member("thumb_"),
      srcSet: `${member("thumb_")} 1x, ${member("member_")} 2x`,
    });
    expect(avatarSources(MEMBER, 112)).toStrictEqual({ src: member("member_") });
  });
});

describe(youtubeId, () => {
  test("reads the id off every YouTube URL shape, and nothing off other hosts or playlists", () => {
    expect(youtubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42")).toBe("dQw4w9WgXcQ");
    expect(youtubeId("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(youtubeId("https://www.youtube.com/embed/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(youtubeId("https://www.youtube.com/playlist?list=PL123")).toBeNull();
    expect(youtubeId("https://tube.undernet.uy/w/abc")).toBeNull();
  });
});
