"use client";

import * as React from "react";
import { useState } from "react";
import { Check, Megaphone, Send } from "lucide-react";

import { cn } from "app/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "components/shared/ui/avatar";
import { Badge } from "components/shared/ui/badge";
import { Button } from "components/shared/ui/button";
import { Empty } from "components/shared/ui/empty";
import { Label } from "components/shared/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "components/shared/ui/select";
import { Switch } from "components/shared/ui/switch";
import { Textarea } from "components/shared/ui/textarea";

import { AckList } from "./AckList";
import { initials, relativeTime, type StaffAnnouncement, type StaffTask } from "./helpers";

interface AnnouncementsPanelProps {
  announcements: StaffAnnouncement[];
  tasks: StaffTask[];
  canEdit: boolean;
  isSending: boolean;
  onSend: (values: { body: string; urgent: boolean; taskId: string | null }) => Promise<void>;
  onAck: (announcementId: string) => void;
}

export function AnnouncementsPanel({
  announcements,
  tasks,
  canEdit,
  isSending,
  onSend,
  onAck,
}: AnnouncementsPanelProps) {
  const [body, setBody] = useState("");
  const [urgent, setUrgent] = useState(false);
  const [taskId, setTaskId] = useState<string>("all");

  const assignableTasks = tasks.filter((task) => task.type !== "milestone" && task.assignees.length > 0);

  const handleSend = async () => {
    if (!body.trim()) return;
    await onSend({ body: body.trim(), urgent, taskId: taskId === "all" ? null : taskId });
    setBody("");
    setUrgent(false);
    setTaskId("all");
  };

  return (
    <div className="space-y-3">
      {canEdit && (
        <div className="space-y-3 rounded-lg border border-border bg-card p-3">
          <Textarea
            className="min-h-[72px] resize-none text-base sm:text-sm"
            placeholder="Anuncio para el staff…"
            rows={2}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void handleSend();
            }}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Select value={taskId} onValueChange={setTaskId}>
              <SelectTrigger className="h-11 flex-1 text-xs sm:h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todo el staff</SelectItem>
                {assignableTasks.map((task) => (
                  <SelectItem key={task.id} value={task.id}>
                    Asignados: {task.title.slice(0, 30)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <label
              className="flex h-11 cursor-pointer items-center gap-2 rounded-md border border-border px-3 sm:h-9"
              htmlFor="announce-urgent"
            >
              <Switch checked={urgent} id="announce-urgent" onCheckedChange={setUrgent} />
              <Label className="cursor-pointer text-xs text-muted-foreground" htmlFor="announce-urgent">
                Urgente
              </Label>
            </label>
            <Button
              className="h-11 w-full sm:h-9 sm:w-auto"
              disabled={isSending || !body.trim()}
              onClick={() => void handleSend()}
            >
              <Send />
              {isSending ? "Enviando…" : "Enviar"}
            </Button>
          </div>
        </div>
      )}

      {announcements.length === 0 ? (
        <Empty
          className="py-10"
          description="Los anuncios del día van a aparecer acá."
          icon={Megaphone}
          title="Sin anuncios"
        />
      ) : (
        <ul className="space-y-2">
          {announcements.map((announcement) => (
            <li
              key={announcement.id}
              className={cn(
                "rounded-lg border border-border bg-card p-3",
                announcement.urgent && !announcement.ackedByMe && "border-primary/60 bg-primary/[0.06]"
              )}
            >
              <div className="flex items-center gap-2">
                <Avatar className="h-6 w-6">
                  {announcement.author?.image ? (
                    <AvatarImage alt={announcement.author.name} src={announcement.author.image} />
                  ) : null}
                  <AvatarFallback className="text-[9px]">{initials(announcement.author?.name ?? "??")}</AvatarFallback>
                </Avatar>
                <span className="truncate text-xs font-medium text-foreground">
                  {announcement.author?.name ?? "Staff"}
                </span>
                <span className="shrink-0 font-terminal text-[10px] tabular-nums text-muted-foreground">
                  {relativeTime(announcement.createdAt)}
                </span>
                {announcement.urgent && (
                  <Badge className="ml-auto shrink-0 border-primary/50 font-normal text-primary" variant="outline">
                    Urgente
                  </Badge>
                )}
              </div>

              <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-foreground">{announcement.body}</p>
              {announcement.taskTitle && (
                <p className="mt-1 text-xs text-muted-foreground">Para asignados de: {announcement.taskTitle}</p>
              )}

              {!announcement.ackedByMe && (
                <Button
                  className="mt-2.5 h-10 w-full sm:h-9"
                  size="sm"
                  variant="outline"
                  onClick={() => onAck(announcement.id)}
                >
                  <Check />
                  Marcar como recibido
                </Button>
              )}

              <div className="mt-2 border-t border-border pt-2">
                <AckList announcement={announcement} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
