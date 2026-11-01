"use client";

import { useState } from "react";

import { PageTabs } from "components/Admin/comms/PageTabs";
import { Tabs, TabsContent } from "components/shared/ui/tabs";

import CompanionControl from "../CompanionControl";
import CompanionWorkbench from "../CompanionWorkbench";

export const COMPANION_TABS = ["control", "lab"] as const;
export type CompanionTab = (typeof COMPANION_TABS)[number];

/**
 * /admin/companion: «Control» (the physical Owys and the bridge) and «Laboratorio» (the emulator
 * and the voice lab). A tab stays mounted once opened, so a browser serving as a device's audio,
 * or a conversation in the lab, survives a look at the other one. The choice lives in `?tab=`.
 */
export function CompanionTabs({ initialTab }: { initialTab: CompanionTab }) {
  const [tab, setTab] = useState<CompanionTab>(initialTab);
  const [opened, setOpened] = useState<ReadonlySet<CompanionTab>>(() => new Set([initialTab]));

  const change = (next: string) => {
    const value = COMPANION_TABS.find((item) => item === next) ?? "control";
    setTab(value);
    setOpened((seen) => (seen.has(value) ? seen : new Set([...seen, value])));
    const url = new URL(window.location.href);
    if (value === "control") url.searchParams.delete("tab");
    else url.searchParams.set("tab", value);
    window.history.replaceState(null, "", url);
  };

  return (
    <Tabs value={tab} onValueChange={change}>
      <div className="mx-auto w-full max-w-[1600px] px-4 pt-3 md:px-6">
        <PageTabs
          items={[
            { value: "control", label: "Control" },
            { value: "lab", label: "Laboratorio" },
          ]}
          value={tab}
        />
      </div>
      <TabsContent
        className="mt-0 data-[state=inactive]:hidden"
        forceMount={opened.has("control") || undefined}
        value="control"
      >
        <CompanionControl />
      </TabsContent>
      <TabsContent
        className="mt-0 data-[state=inactive]:hidden"
        forceMount={opened.has("lab") || undefined}
        value="lab"
      >
        <CompanionWorkbench />
      </TabsContent>
    </Tabs>
  );
}
