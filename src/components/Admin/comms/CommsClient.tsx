"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { PageContainer, PageHeader } from "components/Admin/ui/page";
import { StatusDot } from "components/Admin/ui/status";
import { useSwipeTabs } from "components/Admin/ui/swipe";
import { Tabs, TabsContent } from "components/shared/ui/tabs";
import { useRealtimeChannel } from "hooks/useRealtimeChannel";
import { orpc } from "lib/orpc";
import type { Channels } from "lib/orpc/comms/schemas";
import { eventChannel } from "lib/realtime/channels";

import { Cadence } from "./Cadence";
import { CHANNELS } from "./labels";
import { MessageEditor, type EditorRequest } from "./MessageEditor";
import { OwyMessages } from "./OwyMessages";
import { PageTabs } from "./PageTabs";
import { StaffAnnouncements } from "./StaffAnnouncements";
import { SurveyTab } from "./SurveyTab";
import { COMMS_TABS, type CommsTab } from "./tabs";
import { useDispatchDue } from "./useDispatchDue";

/** Telegram ✓ · Slack ✗: where Owy can write from the site. */
function ChannelDots({ channels }: { channels: Channels | undefined }) {
  if (!channels) return null;

  return (
    <span className="inline-flex items-center gap-3 text-meta">
      {(["telegram", "slack"] as const).map((key) => (
        <span key={key} className="inline-flex items-center gap-1.5">
          <StatusDot ring={channels[key]} tone={channels[key] ? "ok" : "idle"} />
          <span className={channels[key] ? "text-subtle" : "text-muted-foreground"}>
            {CHANNELS[key].label}
            {channels[key] ? null : " · sin configurar"}
          </span>
        </span>
      ))}
    </span>
  );
}

export function CommsClient({
  eventId,
  eventSlug,
  communitySlug,
  initialTab,
  composeAnnouncement,
}: {
  eventId: string;
  eventSlug: string;
  communitySlug: string;
  initialTab: CommsTab;
  composeAnnouncement: boolean;
}) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<CommsTab>(initialTab);
  // One editor for every tab; a fresh mount per request starts it from what was asked.
  const [editor, setEditor] = useState<{ open: boolean; request: EditorRequest | null; key: number }>({
    open: false,
    request: null,
    key: 0,
  });

  useDispatchDue(eventId);

  const input = { eventId };
  const channels = useQuery(orpc.comms.channels.queryOptions({ staleTime: 5 * 60_000 }));
  const messages = useQuery(orpc.comms.list.queryOptions({ input, staleTime: 30_000 }));
  const cadence = useQuery(orpc.comms.cadence.queryOptions({ input, staleTime: 30_000 }));
  const announcements = useQuery(orpc.staffTasks.announcements.list.queryOptions({ input, staleTime: 30_000 }));
  const survey = useQuery(orpc.surveys.get.queryOptions({ input, staleTime: 30_000 }));

  // Content-free pings: re-read only what changed.
  useRealtimeChannel(eventChannel(eventId, "ops"), (topic) => {
    if (topic === "comms") {
      void queryClient.invalidateQueries({ queryKey: orpc.comms.list.key({ input }) });
      void queryClient.invalidateQueries({ queryKey: orpc.comms.cadence.key({ input }) });
    }
    if (topic === "survey") {
      void queryClient.invalidateQueries({ queryKey: orpc.surveys.key() });
      void queryClient.invalidateQueries({ queryKey: orpc.comms.cadence.key({ input }) });
    }
  });
  useRealtimeChannel(eventChannel(eventId, "staff"), () => {
    void queryClient.invalidateQueries({ queryKey: orpc.staffTasks.announcements.list.key({ input }) });
  });

  const changeTab = (next: string) => {
    const value = COMMS_TABS.find((item) => item === next) ?? "anuncios";
    setTab(value);
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", value);
    params.delete("nuevo");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  // On a touchscreen a sideways swipe on the content moves to the next or previous section.
  const swipeTabs = useSwipeTabs(COMMS_TABS, tab, changeTab);

  const openEditor = (request: EditorRequest) =>
    setEditor((current) => ({ open: true, request, key: current.key + 1 }));
  const timeZone = cadence.data?.timezone ?? "America/Montevideo";
  const scheduled = messages.data?.filter((message) => message.status === "scheduled").length;
  const ready = cadence.data?.steps.filter((step) => step.status !== "missing" && step.status !== "failed").length;

  return (
    <PageContainer size="large">
      <PageHeader
        description="Lo que le decimos al staff y al público: antes, durante y después del evento."
        meta={<ChannelDots channels={channels.data} />}
        title="Comunicación"
      />
      <Tabs value={tab} onValueChange={changeTab}>
        <PageTabs
          value={tab}
          items={[
            { value: "anuncios", label: "Anuncios al staff", count: announcements.data?.length },
            { value: "owy", label: "Owy", count: scheduled || undefined },
            { value: "cadencia", label: "Cadencia", count: ready === undefined ? undefined : `${ready}/4` },
            { value: "encuesta", label: "Encuesta", count: survey.data?.responses || undefined },
          ]}
        />
        <div ref={swipeTabs}>
          <TabsContent className="mt-0" value="anuncios">
            <StaffAnnouncements channels={channels.data} eventId={eventId} focusComposer={composeAnnouncement} />
          </TabsContent>
          <TabsContent className="mt-0" value="owy">
            <OwyMessages
              channels={channels.data}
              eventId={eventId}
              messages={messages}
              timeZone={timeZone}
              onEdit={openEditor}
            />
          </TabsContent>
          <TabsContent className="mt-0" value="cadencia">
            <Cadence
              cadence={cadence}
              channels={channels.data}
              eventId={eventId}
              onEdit={openEditor}
              onOpenSurvey={() => changeTab("encuesta")}
            />
          </TabsContent>
          <TabsContent className="mt-0" value="encuesta">
            <SurveyTab
              communitySlug={communitySlug}
              eventId={eventId}
              eventSlug={eventSlug}
              survey={survey}
              surveyUrl={cadence.data?.links.survey}
            />
          </TabsContent>
        </div>
      </Tabs>
      <MessageEditor
        key={editor.key}
        channels={channels.data}
        eventId={eventId}
        open={editor.open}
        request={editor.request}
        timeZone={timeZone}
        onOpenChange={(open) => setEditor((current) => ({ ...current, open }))}
      />
    </PageContainer>
  );
}
