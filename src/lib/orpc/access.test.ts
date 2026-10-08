import { describe, expect, test } from "vitest";

import { getAccess, type Access } from "./base";
import { router } from "./router";

/**
 * Who may call every procedure. A new procedure, or a changed access level,
 * fails this test until the table says so — so a public endpoint can't slip
 * in unreviewed.
 */
const EXPECTED: Record<string, Access> = {
  "cast.getState": "public",
  "cast.setHighlightedNote": "staff",
  "communities.create": "staff",
  "communities.getBySlug": "public",
  "communities.list": "public",
  "communities.members.add": "community:admin",
  "communities.members.list": "community:admin",
  "communities.members.remove": "community:admin",
  "communities.members.updateRole": "community:admin",
  "communities.update": "community:admin",
  "companion.getAudioRouting": "staff",
  "companion.setAudioRouting": "staff",
  "conf.getTickets": "public",
  "countdown.getEndtime": "public",
  "countdown.getState": "public",
  "countdown.updateState": "staff",
  "dashboard.getStats": "staff",
  "eventbrite.getAttendees": "staff",
  "eventbrite.getSummary": "staff",
  "obsControl.ack": "staff",
  "obsControl.claim": "staff",
  "obsControl.history": "staff",
  "obsControl.pending": "staff",
  "obsControl.release": "staff",
  "obsControl.report": "staff",
  "obsControl.send": "staff",
  "obsControl.status": "staff",
  "obsCue.create": "staff",
  "obsCue.fire": "staff",
  "obsCue.list": "staff",
  "obsCue.remove": "staff",
  "obsCue.reorder": "staff",
  "obsCue.step": "staff",
  "obsCue.update": "staff",
  "obsQueue.getState": "public",
  "obsQueue.loop": "staff",
  "obsQueue.updateState": "staff",
  "ocr.extractCard": "staff",
  "ocr.findFreeSpot": "staff",
  "ocr.processImageWithSuggestion": "staff",
  "openSpaces.create": "staff",
  "openSpaces.delete": "staff",
  "openSpaces.get": "public",
  "openSpaces.listByCommunity": "community:member",
  "openSpaces.listForAdmin": "authed",
  "openSpaces.update": "staff",
  "owyStage.disconnectSpotify": "staff",
  "owyStage.fireEffect": "staff",
  "owyStage.getMeetups": "public",
  "owyStage.getPulse": "public",
  "owyStage.getRundown": "staff",
  "owyStage.getSpeakers": "public",
  "owyStage.getSpotify": "public",
  "owyStage.getState": "public",
  "owyStage.getWeather": "public",
  "owyStage.inputs": "public",
  "owyStage.nowPlaying": "staff",
  "owyStage.saveRundown": "staff",
  "owyStage.setFace": "staff",
  "owyStage.setScene": "staff",
  "owyStage.spotifyStatus": "staff",
  "owyStage.submit": "public",
  "rooms.create": "staff",
  "rooms.delete": "staff",
  "rooms.get": "public",
  "rooms.getByOpenSpace": "public",
  "rooms.reorder": "staff",
  "rooms.update": "staff",
  "schedules.create": "staff",
  "schedules.delete": "staff",
  "schedules.get": "public",
  "schedules.getByOpenSpace": "public",
  "schedules.update": "staff",
  "staffTasks.announcements.ack": "community:member",
  "staffTasks.announcements.create": "community:editor",
  "staffTasks.announcements.list": "community:member",
  "staffTasks.assign": "community:editor",
  "staffTasks.create": "community:editor",
  "staffTasks.delete": "community:editor",
  "staffTasks.join": "community:member",
  "staffTasks.leave": "community:member",
  "staffTasks.list": "community:member",
  "staffTasks.roster": "community:member",
  "staffTasks.setStatus": "community:member",
  "staffTasks.shiftFrom": "community:editor",
  "staffTasks.unassign": "community:editor",
  "staffTasks.update": "community:editor",
  "tracks.bulkUpdateBySchedule": "staff",
  "tracks.create": "staff",
  "tracks.createPlaced": "staff",
  "tracks.delete": "staff",
  "tracks.get": "public",
  "tracks.getByOpenSpace": "public",
  "tracks.list": "public",
  "tracks.swap": "staff",
  "tracks.update": "staff",
};

function accessMap(node: Record<string, unknown>, path: string[] = []): Record<string, Access | undefined> {
  return Object.fromEntries(
    Object.entries(node).flatMap(([key, value]) => {
      const here = [...path, key];
      if (typeof value !== "object" || value === null) return [];
      if ("~orpc" in value) return [[here.join("."), getAccess(value as Parameters<typeof getAccess>[0])]];

      return Object.entries(accessMap(value as Record<string, unknown>, here));
    })
  );
}

describe("procedure access", () => {
  test("every procedure declares exactly the access level in the table", () => {
    expect(accessMap(router)).toStrictEqual(EXPECTED);
  });
});
