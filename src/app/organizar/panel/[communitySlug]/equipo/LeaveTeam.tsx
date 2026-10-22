"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { LogOut } from "lucide-react";

import { ConfirmDialog } from "components/Admin/panel";
import { SettingsCard, SettingsRow, SettingsSection } from "components/Admin/settings/settings";
import { Button } from "components/shared/ui/button";
import { toast } from "components/shared/ui/toast-utils";
import { orpc } from "lib/orpc";

/** "Salir del equipo": leave the community's team, then back to the panel's front door. */
export function LeaveTeam({ communityId, communityName }: { communityId: string; communityName: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const leave = useMutation(
    orpc.communities.members.leave.mutationOptions({
      onSuccess: () => {
        toast.success("Saliste del equipo", `Ya no sos parte de ${communityName}.`);
        router.push("/organizar/panel");
        // The panel's layout lists the communities: it has to forget this one.
        router.refresh();
      },
      onError: (error) => {
        setConfirming(false);
        toast.error("No pudiste salir", error.message);
      },
    })
  );

  return (
    <SettingsSection className="mt-8" id="salir" title="Salir">
      <SettingsCard>
        <SettingsRow
          compact
          hint={`Dejás de ver el panel de ${communityName}. Para volver, alguien del equipo te tiene que sumar.`}
          label="Salir del equipo"
        >
          <Button size="sm" variant="destructive" onClick={() => setConfirming(true)}>
            <LogOut />
            Salir
          </Button>
        </SettingsRow>
      </SettingsCard>
      <ConfirmDialog
        confirmLabel="Salir del equipo"
        description={`Dejás de ver el staff, las tareas y los anuncios de ${communityName}.`}
        open={confirming}
        pending={leave.isPending}
        pendingLabel="Saliendo…"
        title={`¿Salir del equipo de ${communityName}?`}
        onConfirm={() => leave.mutate({ communityId })}
        onOpenChange={setConfirming}
      />
    </SettingsSection>
  );
}
