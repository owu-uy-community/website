"use client";

import { useEffect, useState } from "react";

import { cn } from "app/lib/utils";
import { Badge } from "components/shared/ui/badge";
import { Checkbox } from "components/shared/ui/checkbox";
import { PLATFORM_ROLES, type Permission, type PlatformRole } from "lib/authz/catalog";
import {
  COMMUNITY_PERMISSION_LABELS,
  PLATFORM_ACTION_LABELS,
  PLATFORM_RESOURCE_LABELS,
  roleLabel,
  ROLE_LABELS,
} from "lib/authz/labels";

/** Does the viewer hold this platform permission (access.me). */
export type Can = (permission: Permission) => boolean;

export const reason = (error: unknown) =>
  error instanceof Error && error.message ? error.message : "Error inesperado";

export function useDebounced<T>(value: T, ms: number) {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);

  return settled;
}

/** Platform roles as badges; "user" (no role) reads as a dash. Takes "staff,moderator" too. */
export function RoleBadges({ roles }: { roles: readonly string[] | string }) {
  const list = (typeof roles === "string" ? roles.split(",") : roles).filter((role) => role && role !== "user");
  if (list.length === 0) return <span className="text-faint">—</span>;

  return (
    <span className="flex flex-wrap gap-1">
      {list.map((role) => (
        <Badge key={role} title={ROLE_LABELS[role]?.hint} variant="secondary">
          {roleLabel(role)}
        </Badge>
      ))}
    </span>
  );
}

const communityLabels = COMMUNITY_PERMISSION_LABELS as Record<
  string,
  { label: string; actions: Record<string, string> } | undefined
>;

/** "Eventos", "Llaves API"; the resource's own name when it has no label. */
export const resourceLabel = (resource: string) =>
  (PLATFORM_RESOURCE_LABELS as Record<string, string | undefined>)[resource] ??
  communityLabels[resource]?.label ??
  resource;

/** "Publicar"; platform-only actions have no label and read as their name. */
export const actionLabel = (resource: string, action: string) =>
  communityLabels[resource]?.actions[action] ?? PLATFORM_ACTION_LABELS[`${resource}:${action}`] ?? action;

/** Platform roles a person can be given ("user" is having none). */
export const PERSON_ROLES = PLATFORM_ROLES.filter((role) => role !== "user");

export const isPlatformRole = (role: string): role is PlatformRole => (PLATFORM_ROLES as string[]).includes(role);

/** Platform roles as checkboxes, each with what it allows. */
export function RoleChecklist({
  id,
  roles = PERSON_ROLES,
  value,
  onChange,
  disabled,
}: {
  id: string;
  roles?: readonly PlatformRole[];
  value: readonly PlatformRole[];
  onChange: (roles: PlatformRole[]) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid gap-1.5">
      {roles.map((role) => {
        const checked = value.includes(role);

        return (
          <label
            key={role}
            className={cn(
              "flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2 transition-colors",
              checked ? "border-primary/30 bg-primary/[0.04]" : "border-border hover:bg-white/[0.02]",
              disabled && "cursor-not-allowed opacity-60"
            )}
            htmlFor={`${id}-${role}`}
          >
            <Checkbox
              checked={checked}
              className="mt-0.5"
              disabled={disabled}
              id={`${id}-${role}`}
              onCheckedChange={(next) =>
                onChange(next === true ? [...value, role] : value.filter((item) => item !== role))
              }
            />
            <span className="min-w-0">
              <span className="block text-ui font-medium text-foreground">{roleLabel(role)}</span>
              <span className="block text-meta text-muted-foreground">{ROLE_LABELS[role]?.hint}</span>
            </span>
          </label>
        );
      })}
    </div>
  );
}

const OS = [
  ["iPhone", "iPhone"],
  ["iPad", "iPad"],
  ["Android", "Android"],
  ["Mac OS", "Mac"],
  ["Windows", "Windows"],
  ["Linux", "Linux"],
] as const;
// Order matters: Edge's user agent names Chrome and Safari too, Chrome's names Safari.
const BROWSERS = [
  ["Edg", "Edge"],
  ["Firefox", "Firefox"],
  ["Chrome", "Chrome"],
  ["Safari", "Safari"],
] as const;

/** "Chrome · Mac" from a user agent, for session lists. */
export function deviceOf(userAgent: string | null | undefined): string {
  if (!userAgent) return "Dispositivo desconocido";
  const os = OS.find(([needle]) => userAgent.includes(needle))?.[1];
  const browser = BROWSERS.find(([needle]) => userAgent.includes(needle))?.[1];

  return [browser, os].filter(Boolean).join(" · ") || userAgent.slice(0, 40);
}
