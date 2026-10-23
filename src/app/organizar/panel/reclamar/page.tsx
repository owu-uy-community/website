import { headers } from "next/headers";

import { PageContainer, PageHeader } from "components/Admin/ui/page";
import { ClaimClient } from "components/organizar/ClaimClient";
import { callerFor } from "lib/orpc/server";

import { panelAccess } from "../access";

export const metadata = { title: "Organizar una comunidad · OWU" };

export default async function ClaimPage({ searchParams }: { searchParams: Promise<{ proponer?: string }> }) {
  const { claims, memberIds } = await panelAccess("/organizar/panel/reclamar");
  const [directory, { proponer }] = await Promise.all([callerFor(await headers()).communities.list(), searchParams]);

  return (
    <PageContainer>
      <PageHeader
        description="Elegí la comunidad que organizás, o proponela si todavía no está en OWU. El staff lo confirma y te avisamos por mail: después tenés el panel completo."
        title="¿Qué comunidad organizás?"
      />
      <ClaimClient
        claims={claims}
        communities={directory
          .filter((community) => community.listed)
          .map(({ id, slug, name, logoUrl, status, topics }) => ({ id, slug, name, logoUrl, status, topics }))}
        organizedIds={memberIds}
        proposing={proponer !== undefined}
      />
    </PageContainer>
  );
}
