import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ArrowRight, Flag } from "lucide-react";

import { PageContainer, PageHeader, Panel, PanelHead } from "components/Admin/ui/page";
import { LAST_COMMUNITY_COOKIE, panelHref } from "components/organizar/shell/nav";
import { CommunityMark } from "components/shared/CommunityMark";
import { plural } from "lib/organizar/words";

import { panelAccess } from "./access";

/**
 * The panel opens on the community used last on this device, else the first one you organize. Site
 * staff who organize none pick one (they can open any); everyone else is asked which they organize.
 */
export default async function PanelIndex() {
  const { communities, isStaff, memberIds } = await panelAccess();
  const last = (await cookies()).get(LAST_COMMUNITY_COOKIE)?.value;
  const target =
    communities.find((community) => community.slug === last) ??
    communities.find((community) => memberIds.includes(community.id));

  if (target) redirect(panelHref(target.slug));
  if (!isStaff || communities.length === 0) redirect("/organizar/panel/reclamar");

  return (
    <PageContainer>
      <PageHeader
        description="Como staff de OWU podés abrir el panel de cualquier comunidad. La próxima vez abre en la última que usaste."
        title="Elegí una comunidad"
      />
      <Panel>
        <PanelHead icon={Flag} meta={plural(communities.length, "comunidad", "comunidades")} title="Comunidades" />
        <ul className="divide-y divide-border">
          {communities.map((community) => (
            <li key={community.id}>
              <Link
                className="flex items-center gap-3 px-3.5 py-2.5 transition-colors hover:bg-raised"
                href={panelHref(community.slug)}
              >
                <CommunityMark community={community} size={28} />
                <span className="min-w-0 flex-1 truncate text-ui font-medium text-foreground">{community.name}</span>
                <ArrowRight aria-hidden className="size-4 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      </Panel>
    </PageContainer>
  );
}
