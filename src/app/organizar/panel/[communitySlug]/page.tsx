import { notFound } from "next/navigation";

import { PageContainer, PageHeader } from "components/Admin/ui/page";
import { EmptyState } from "components/Admin/ui/states";

import { panelCommunity } from "../access";

export default async function PanelHome({ params }: { params: Promise<{ communitySlug: string }> }) {
  const { communitySlug } = await params;
  const access = await panelCommunity(communitySlug);
  if (!access) notFound();

  return (
    <PageContainer>
      <PageHeader description={`El panel de ${access.community.name} en OWU.`} title="Inicio" />
      <EmptyState
        owy
        description="Elegí una fecha sin choques, conseguí espacio y armá tu evento."
        title="Todo listo para organizar"
      />
    </PageContainer>
  );
}
