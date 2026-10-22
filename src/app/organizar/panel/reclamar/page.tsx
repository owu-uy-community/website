import { headers } from "next/headers";

import { PageContainer, PageHeader } from "components/Admin/ui/page";
import { ClaimClient } from "components/organizar/ClaimClient";
import { callerFor } from "lib/orpc/server";

import { panelAccess } from "../access";

export const metadata = { title: "Organizar una comunidad · OWU" };

export default async function ClaimPage() {
  const { communities: organized, claims } = await panelAccess("/organizar/panel/reclamar");
  const directory = (await callerFor(await headers()).communities.list()).filter((community) => community.listed);

  return (
    <PageContainer>
      <PageHeader
        description="Elegí la comunidad que organizás. El staff de OWU lo confirma y te avisamos por mail: después tenés el panel completo."
        title="¿Qué comunidad organizás?"
      />
      <ClaimClient
        claims={claims}
        communities={directory.map(({ id, slug, name, logoUrl, status, topics }) => ({
          id,
          slug,
          name,
          logoUrl,
          status,
          topics,
        }))}
        organizedIds={organized.map((community) => community.id)}
      />
    </PageContainer>
  );
}
