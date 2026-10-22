import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { LAST_COMMUNITY_COOKIE, panelHref } from "components/organizar/shell/nav";

import { panelAccess } from "./access";

/** The panel opens on the community used last on this device, or asks which one you organize. */
export default async function PanelIndex() {
  const { communities, isStaff } = await panelAccess();
  const last = (await cookies()).get(LAST_COMMUNITY_COOKIE)?.value;
  const target = communities.find((community) => community.slug === last) ?? (isStaff ? null : communities[0]);

  redirect(target ? panelHref(target.slug) : "/organizar/panel/reclamar");
}
