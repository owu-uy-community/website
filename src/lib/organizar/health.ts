/**
 * Whether a community is alive, from its own calendar: Inicio tells its team, the staff's outreach
 * queue lists the ones that need a hand. Thresholds after CNCF (90 days) and R-Ladies (6 months).
 */

export type Health = "activa" | "en-riesgo" | "dormida" | "en-pausa";

/** Nothing for this long and nothing scheduled: worth a nudge. */
export const AT_RISK_DAYS = 60;
/** Nothing for this long: dormant. */
export const DORMANT_DAYS = 180;
/** Organizers count as active when they did something in the panel this recently. */
export const ACTIVE_ORGANIZER_DAYS = 90;
/** Fewer active organizers than this, and one person leaving stops the community. */
export const MIN_ORGANIZERS = 2;

const DAY = 86_400_000;

export function healthOf(
  community: {
    /** The last published event that already happened */
    lastEventAt: Date | string | null;
    /** A published event or a live hold ahead */
    hasUpcoming: boolean;
    status: string;
    pausedUntil: string | null;
  },
  now = Date.now()
): Health {
  if (community.status === "pausa" && (!community.pausedUntil || new Date(community.pausedUntil).getTime() > now)) {
    return "en-pausa";
  }
  if (community.hasUpcoming) return "activa";
  if (!community.lastEventAt) return "en-riesgo";
  const idle = (now - new Date(community.lastEventAt).getTime()) / DAY;
  if (idle > DORMANT_DAYS) return "dormida";
  if (idle > AT_RISK_DAYS) return "en-riesgo";

  return "activa";
}

/** Days since the last event, for "Hace 74 días del último evento". */
export const daysSince = (at: Date | string, now = Date.now()) => Math.floor((now - new Date(at).getTime()) / DAY);

/** Too few active organizers: the community depends on one person. */
export const busFactorLow = (activeOrganizers: number) => activeOrganizers < MIN_ORGANIZERS;
