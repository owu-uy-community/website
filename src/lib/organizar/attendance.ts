/**
 * A person's attendance in one community, for its organizers only (never public, never to hosts
 * or sponsors; the RSVP card says so, Ley 18.331 art. 13). Counted over the community's past
 * events with OWU sign-up:
 *
 * - **vino**: they came in through the door.
 * - **no vino**: they had a seat, the door was used that night, they didn't come in and didn't
 *   tell the team (`excusedAt`). Without door data nobody is a no-show.
 * - **liberó tarde**: they freed their seat less than 24 h before the start.
 * - **avisó**: the team marked that they said they couldn't come (or took their place for them).
 *
 * "Primera vez" is derived, never asked: no past seat in the community.
 */

const LATE_RELEASE_MS = 24 * 3_600_000;

export type AttendanceRow = {
  status: string;
  checkedIn: boolean;
  cancelledAt: Date | null;
  excusedAt: Date | null;
  startDate: Date;
  /** The door was used at that event (someone checked in) */
  doorUsed: boolean;
};

export type History = {
  attended: number;
  noShows: number;
  lateReleases: number;
  excused: number;
  /** Past events where they had a seat at the end */
  seated: number;
};

export const EMPTY_HISTORY: History = { attended: 0, noShows: 0, lateReleases: 0, excused: 0, seated: 0 };

/** One person's rows (past events of one community) as counts. */
export function summarize(rows: AttendanceRow[]): History {
  const history = { ...EMPTY_HISTORY };
  for (const row of rows) {
    if (row.checkedIn) history.attended += 1;
    if (row.status === "attending" || row.checkedIn) history.seated += 1;
    if (row.excusedAt) {
      history.excused += 1;
      continue;
    }
    if (row.status === "attending" && !row.checkedIn && row.doorUsed) history.noShows += 1;
    if (
      row.status === "cancelled" &&
      row.cancelledAt &&
      row.cancelledAt.getTime() >= row.startDate.getTime() - LATE_RELEASE_MS
    ) {
      history.lateReleases += 1;
    }
  }

  return history;
}

/** No past seat in this community: they're new here. */
export const isFirstTime = (history: History) => history.seated === 0;

/** "vino a 3 de 4", over the events where it can be known; null when none. */
export function cameLabel(history: History) {
  const known = history.attended + history.noShows;

  return known === 0 ? null : `vino a ${history.attended} de ${known}`;
}

/** The friendly nudge goes after the second time they had a seat, didn't come and didn't say. */
export const NUDGE_AFTER_NO_SHOWS = 2;
