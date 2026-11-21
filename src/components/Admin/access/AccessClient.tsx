"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { PageTabs } from "components/Admin/comms/PageTabs";
import { useAccessMe } from "components/Admin/shell/use-access-me";
import { PageContainer, PageHeader } from "components/Admin/ui/page";
import { ErrorState } from "components/Admin/ui/states";
import { useSwipeTabs } from "components/Admin/ui/swipe";
import { Skeleton } from "components/shared/ui/skeleton";
import { Tabs, TabsContent } from "components/shared/ui/tabs";
import type { Permission } from "lib/authz/catalog";
import { orpc } from "lib/orpc";

import { ApiKeysTab } from "./ApiKeysTab";
import { AuditTab } from "./AuditTab";
import { InvitationsTab } from "./InvitationsTab";
import { PeopleTab } from "./PeopleTab";
import { RequestsTab } from "./RequestsTab";
import { RolesTab } from "./RolesTab";
import type { Can } from "./shared";

const TABS: { value: string; label: string; needs?: Permission }[] = [
  { value: "personas", label: "Personas", needs: "user:list" },
  { value: "pedidos", label: "Pedidos", needs: "claim:read" },
  { value: "invitaciones", label: "Invitaciones", needs: "claim:read" },
  { value: "roles", label: "Roles" },
  { value: "llaves", label: "Llaves API", needs: "apiKey:read" },
  { value: "auditoria", label: "Auditoría", needs: "audit:read" },
];

/** Acceso: who holds which role, the waitlist, invitations, what each role may do, machines' keys, the log. */
export function AccessClient({ initialTab }: { initialTab: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const me = useAccessMe();
  const [tab, setTab] = useState(initialTab);
  // The page needs claim:read: the waitlist's count is always readable here.
  const requests = useQuery(orpc.access.requests.list.queryOptions({ input: {} }));

  const can: Can = (permission) => me.data?.permissions.includes(permission) ?? false;
  const tabs = TABS.filter((item) => !item.needs || can(item.needs));
  const values = tabs.map((item) => item.value);
  const active = values.includes(tab) ? tab : (values[0] ?? "roles");

  const changeTab = (next: string) => {
    setTab(next);
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", next);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };
  const swipeTabs = useSwipeTabs(values, active, changeTab);
  const pending = requests.data?.filter((request) => request.status === "pending").length;

  return (
    <PageContainer size="large">
      <PageHeader
        description="Quién entra al panel y con qué rol, los pedidos, las llaves de las máquinas y lo que pasó."
        title="Acceso"
      />
      {me.isError ? (
        <ErrorState retrying={me.isFetching} title="No se pudo leer tu acceso" onRetry={() => void me.refetch()} />
      ) : !me.data ? (
        <div aria-hidden className="space-y-3">
          <Skeleton className="h-9 w-full max-w-xl" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <Tabs value={active} onValueChange={changeTab}>
          <PageTabs
            items={tabs.map((item) => ({
              value: item.value,
              label: item.label,
              count: item.value === "pedidos" && pending ? pending : undefined,
            }))}
            value={active}
          />
          <div ref={swipeTabs}>
            <TabsContent className="mt-0" value="personas">
              <PeopleTab can={can} meId={me.data.id} />
            </TabsContent>
            <TabsContent className="mt-0" value="pedidos">
              <RequestsTab can={can} />
            </TabsContent>
            <TabsContent className="mt-0" value="invitaciones">
              <InvitationsTab can={can} />
            </TabsContent>
            <TabsContent className="mt-0" value="roles">
              <RolesTab />
            </TabsContent>
            <TabsContent className="mt-0" value="llaves">
              <ApiKeysTab can={can} />
            </TabsContent>
            <TabsContent className="mt-0" value="auditoria">
              <AuditTab can={can} />
            </TabsContent>
          </div>
        </Tabs>
      )}
    </PageContainer>
  );
}
