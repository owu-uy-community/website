import { and, asc, eq, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { Effect } from "effect";

import { communityAssets, communityMembers, user, type CommunityAssetRow } from "../../db/schema";
import { query } from "../db";
import { Invalid, NotFound } from "../errors";
import type { Asset, SaveAssetInput } from "./schemas";

const holder = alias(user, "holder");
const backup = alias(user, "backup");

const assetNotFound = new NotFound({ entity: "asset", message: "Esa cuenta no está en esta comunidad" });

const listQuery = (communityId: string, id?: string) =>
  query((db) =>
    db
      .select({ asset: communityAssets, holder: holder.name, backup: backup.name })
      .from(communityAssets)
      .leftJoin(holder, eq(holder.id, communityAssets.holderUserId))
      .leftJoin(backup, eq(backup.id, communityAssets.backupUserId))
      .where(and(eq(communityAssets.communityId, communityId), id ? eq(communityAssets.id, id) : undefined))
      .orderBy(asc(communityAssets.platform), asc(communityAssets.createdAt))
  ).pipe(
    Effect.map((rows) =>
      rows.map(
        ({ asset, ...names }: { asset: CommunityAssetRow; holder: string | null; backup: string | null }): Asset => ({
          id: asset.id,
          platform: asset.platform as Asset["platform"],
          label: asset.label,
          holder: asset.holderUserId
            ? { userId: asset.holderUserId, name: names.holder ?? "" }
            : asset.holderName
              ? { userId: null, name: asset.holderName }
              : null,
          backup: asset.backupUserId ? { userId: asset.backupUserId, name: names.backup ?? "" } : null,
          note: asset.note,
          updatedAt: asset.updatedAt.toISOString(),
        })
      )
    )
  );

/** The community's accounts elsewhere and who holds each. */
export const list = (communityId: string) => listQuery(communityId);

/** Add an account, or change one of this community's. Holders and backups must be on the team. */
export const save = ({ communityId, id, ...fields }: SaveAssetInput) =>
  Effect.gen(function* () {
    const people = [fields.holderUserId, fields.backupUserId].filter((value) => value !== null);
    if (people.length > 0) {
      const members = yield* query((db) =>
        db
          .select({ userId: communityMembers.userId })
          .from(communityMembers)
          .where(and(eq(communityMembers.communityId, communityId), inArray(communityMembers.userId, people)))
      );
      if (people.some((person) => !members.some((member) => member.userId === person))) {
        return yield* new Invalid({
          message: "Quien la tiene, o de respaldo, tiene que ser del equipo: si no, escribí su nombre",
        });
      }
    }
    const values = { ...fields, holderName: fields.holderUserId ? "" : fields.holderName };
    const [row] = id
      ? yield* query((db) =>
          db
            .update(communityAssets)
            .set(values)
            .where(and(eq(communityAssets.id, id), eq(communityAssets.communityId, communityId)))
            .returning({ id: communityAssets.id })
        )
      : yield* query((db) =>
          db
            .insert(communityAssets)
            .values({ communityId, ...values })
            .returning({ id: communityAssets.id })
        );
    if (!row) return yield* assetNotFound;
    const [asset] = yield* listQuery(communityId, row.id);

    return asset;
  });

/** Take an account off the list (it doesn't touch the account itself). */
export const remove = (input: { communityId: string; id: string }) =>
  query((db) =>
    db
      .delete(communityAssets)
      .where(and(eq(communityAssets.id, input.id), eq(communityAssets.communityId, input.communityId)))
      .returning({ id: communityAssets.id })
  ).pipe(Effect.flatMap(([row]) => (row ? Effect.succeed({ ok: true as const }) : Effect.fail(assetNotFound))));
