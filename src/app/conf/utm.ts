import { CONF_DATES } from "app/lib/constants";
import { addUtmParams } from "app/lib/utils";

/*
 * Every link that leaves /conf carries the same four fields, so the sites we send traffic to
 * (sponsors, the community Slack, the meetup event pages) can tell OWU CONF apart from the
 * rest of owu.uy — and tell our placements apart from each other:
 *
 *   utm_source    owu-conf    the property that sent the click, not the page
 *   utm_medium    referral    the only medium analytics tools map to the Referral channel;
 *                             an invented word lands under "Unassigned" on the other side
 *   utm_campaign  the edition so next year's traffic doesn't blend into this one's
 *   utm_content   the placement — the wall and the marquee link to the very same sponsor
 *
 * Internal links stay untagged on purpose (addUtmParams skips them): tagging our own pages
 * opens a new session in analytics and throws away how the visit actually started.
 */

/* Read off the event date so a new edition only means updating CONF_DATES */
const CAMPAIGN = `owu-conf-${CONF_DATES.event.slice(0, 4)}`;

/** Where in /conf the click happened. One name per placement, reused across pages. */
export type ConfLinkPlacement =
  | "navbar-cta"
  | "hero-venue"
  | "sponsor-marquee"
  | "sponsors-grid"
  | "institutional-support"
  | "team-linkedin"
  | "meetups-agenda"
  | "footer-social";

/**
 * Tags an outbound OWU CONF link for the destination's analytics
 * @param url - The URL being linked to; internal and non-http hrefs come back untouched
 * @param placement - The section of /conf the link lives in
 * @returns The URL with the OWU CONF UTM fields applied
 */
export function confUtm(url: string, placement: ConfLinkPlacement): string {
  return addUtmParams(url, {
    source: "owu-conf",
    medium: "referral",
    campaign: CAMPAIGN,
    content: placement,
  });
}
