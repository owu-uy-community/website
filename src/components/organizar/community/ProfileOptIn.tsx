"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { UserRound } from "lucide-react";

import { SwitchRow } from "components/Admin/panel";
import { toast } from "components/shared/ui/toast-utils";
import { orpc } from "lib/orpc";

/** "Aparecer en el perfil público": the organizer's own choice to show in «Organizan». */
export function ProfileOptIn({
  communityId,
  communityName,
  initial,
}: {
  communityId: string;
  communityName: string;
  initial: boolean;
}) {
  const [shown, setShown] = useState(initial);
  const save = useMutation(
    orpc.communities.members.showOnProfile.mutationOptions({
      onSuccess: (result) => {
        setShown(result.showOnProfile);
        toast.success(result.showOnProfile ? "Aparecés en el perfil público" : "Ya no aparecés en el perfil público");
      },
      onError: (error) => toast.error("No se pudo guardar", error.message),
    })
  );

  return (
    <SwitchRow
      checked={save.isPending ? save.variables.show : shown}
      disabled={save.isPending}
      hint={`Tu nombre y tu foto en la página de ${communityName}, en «Organizan». Tu email nunca.`}
      icon={UserRound}
      id="perfil-publico"
      label="Aparecer en el perfil público"
      onCheckedChange={(show) => save.mutate({ communityId, show })}
    />
  );
}
