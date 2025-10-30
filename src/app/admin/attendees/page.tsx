"use client";

import * as React from "react";
import { Suspense, useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Search, UserCheck, UserX, Users, RefreshCw, Mail, Ticket, Calendar, Loader2 } from "lucide-react";
import { useEventbriteAttendees } from "hooks/useEventbriteAttendees";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "components/shared/ui/card";
import { Input } from "components/shared/ui/input";
import { Badge } from "components/shared/ui/badge";
import { Button } from "components/shared/ui/button";
import { Skeleton } from "components/shared/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "components/shared/ui/avatar";
import type { EventbriteAttendee } from "lib/eventbrite/types";
import { getGravatarUrl } from "lib/gravatar";
import { cn } from "app/lib/utils";
import { AdminAuthWrapper } from "components/shared/AdminAuthWrapper";

function AttendeesContent() {
  const searchParams = useSearchParams();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "checked_in" | "not_checked_in">("all");

  // Ref for intersection observer
  const loadMoreRef = useRef<HTMLDivElement>(null);

  // Read filter from URL query params
  useEffect(() => {
    const filterParam = searchParams.get("filter");
    if (filterParam === "checked_in" || filterParam === "not_checked_in") {
      setStatusFilter(filterParam);
    } else {
      setStatusFilter("all");
    }
  }, [searchParams]);

  const {
    attendees,
    summary,
    event,
    isLoading,
    error,
    refreshAttendees,
    isRefreshing,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useEventbriteAttendees({
    pageSize: 50,
    infinite: true, // Enable infinite scrolling
  });

  // Intersection observer for infinite scroll
  const handleObserver = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      const [target] = entries;
      if (target.isIntersecting && hasNextPage && !isFetchingNextPage) {
        fetchNextPage?.();
      }
    },
    [fetchNextPage, hasNextPage, isFetchingNextPage]
  );

  useEffect(() => {
    const element = loadMoreRef.current;
    if (!element) return;

    const observer = new IntersectionObserver(handleObserver, {
      root: null,
      rootMargin: "200px", // Start loading 200px before reaching the bottom
      threshold: 0.1,
    });

    observer.observe(element);

    return () => {
      if (element) {
        observer.unobserve(element);
      }
    };
  }, [handleObserver]);

  // Filter attendees based on search and status
  const filteredAttendees = useMemo(() => {
    let filtered = attendees.filter((a: EventbriteAttendee) => !a.cancelled && !a.refunded);

    // Filter by check-in status
    if (statusFilter === "checked_in") {
      filtered = filtered.filter((a: EventbriteAttendee) => a.checked_in);
    } else if (statusFilter === "not_checked_in") {
      filtered = filtered.filter((a: EventbriteAttendee) => !a.checked_in);
    }

    // Filter by search term
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (a: EventbriteAttendee) =>
          a.profile.name.toLowerCase().includes(term) ||
          a.profile.email.toLowerCase().includes(term) ||
          a.ticket_class_name.toLowerCase().includes(term)
      );
    }

    return filtered;
  }, [attendees, searchTerm, statusFilter]);

  return (
    <div className="w-full p-6">
      <div className="mb-8">
        <div className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="mb-2 text-3xl font-bold text-white">Asistentes del Evento</h1>
            {event && (
              <p className="text-zinc-400">
                {event.name} • {new Date(event.start).toLocaleDateString("es-UY")}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={refreshAttendees}
              variant="outline"
              size="sm"
              className="border-zinc-700 bg-zinc-800 text-white hover:bg-zinc-700"
              disabled={isRefreshing}
            >
              <RefreshCw size={16} className={cn("mr-2", isRefreshing && "animate-spin")} />
              {isRefreshing ? "Actualizando..." : "Actualizar"}
            </Button>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      {isLoading ? (
        <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="border-zinc-800 bg-zinc-900">
              <CardHeader>
                <Skeleton className="h-4 w-24 bg-zinc-800" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16 bg-zinc-800" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : error ? (
        <Card className="mb-8 border-red-900 bg-red-950/30">
          <CardHeader>
            <CardTitle className="text-red-400">Error al cargar datos</CardTitle>
            <CardDescription className="text-red-300">{error}</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        summary && (
          <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-3">
            <Card
              className={`cursor-pointer border-zinc-800 bg-zinc-900 transition-colors ${statusFilter === "all" ? "ring-2 ring-yellow-400" : "hover:bg-zinc-850"}`}
              onClick={() => setStatusFilter("all")}
            >
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-zinc-400">Total Asistentes</CardTitle>
                <Users className="h-4 w-4 text-zinc-400" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-white">{summary.total_attendees}</div>
                <p className="text-xs text-zinc-500">Inscriptos confirmados</p>
              </CardContent>
            </Card>

            <Card
              className={`cursor-pointer border-zinc-800 bg-zinc-900 transition-colors ${statusFilter === "checked_in" ? "ring-2 ring-green-400" : "hover:bg-zinc-850"}`}
              onClick={() => setStatusFilter("checked_in")}
            >
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-zinc-400">Check-in Realizado</CardTitle>
                <UserCheck className="h-4 w-4 text-green-400" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-400">{summary.checked_in}</div>
                <p className="text-xs text-zinc-500">
                  {summary.total_attendees > 0
                    ? `${Math.round((summary.checked_in / summary.total_attendees) * 100)}%`
                    : "0%"}{" "}
                  del total
                </p>
              </CardContent>
            </Card>

            <Card
              className={`cursor-pointer border-zinc-800 bg-zinc-900 transition-colors ${statusFilter === "not_checked_in" ? "ring-2 ring-yellow-400" : "hover:bg-zinc-850"}`}
              onClick={() => setStatusFilter("not_checked_in")}
            >
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-zinc-400">Pendientes</CardTitle>
                <UserX className="h-4 w-4 text-yellow-400" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-yellow-400">{summary.not_checked_in}</div>
                <p className="text-xs text-zinc-500">Sin check-in</p>
              </CardContent>
            </Card>
          </div>
        )
      )}

      {/* Search and Filters */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 sm:max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <Input
            placeholder="Buscar por nombre, email o tipo de ticket..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="border-zinc-700 bg-zinc-800 pl-10 text-white placeholder:text-zinc-500"
          />
        </div>
        <div className="text-sm text-zinc-400">
          Mostrando {filteredAttendees.length} de{" "}
          {attendees.filter((a: EventbriteAttendee) => !a.cancelled && !a.refunded).length} asistentes
        </div>
      </div>

      {/* Attendees List */}
      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Card key={i} className="border-zinc-800 bg-zinc-900">
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <Skeleton className="h-12 w-12 rounded-full bg-zinc-800" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-48 bg-zinc-800" />
                    <Skeleton className="h-3 w-32 bg-zinc-800" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filteredAttendees.length === 0 ? (
        <Card className="border-zinc-800 bg-zinc-900">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Users size={48} className="mb-4 text-zinc-600" />
            <p className="text-zinc-400">No se encontraron asistentes</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="space-y-3">
            {filteredAttendees.map((attendee: EventbriteAttendee) => (
              <AttendeeCard key={attendee.id} attendee={attendee} />
            ))}
          </div>

          {/* Intersection observer sentinel */}
          <div ref={loadMoreRef} className="flex items-center justify-center py-8">
            {isFetchingNextPage && (
              <div className="flex items-center gap-2 text-zinc-400">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>Cargando más asistentes...</span>
              </div>
            )}
            {!hasNextPage && attendees.length > 0 && (
              <p className="text-sm text-zinc-500">No hay más asistentes para cargar</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function AttendeeCard({ attendee }: { attendee: EventbriteAttendee }) {
  const initials = attendee.profile.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const avatarUrl = getGravatarUrl(attendee.profile.email, 80, "identicon");

  return (
    <Card className="hover:bg-zinc-850 border-zinc-800 bg-zinc-900 transition-colors">
      <CardContent className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <Avatar className="h-12 w-12">
              <AvatarImage src={avatarUrl} alt={attendee.profile.name} />
              <AvatarFallback className="bg-yellow-400 text-black">{initials}</AvatarFallback>
            </Avatar>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-white">{attendee.profile.name}</h3>
                {attendee.checked_in ? (
                  <Badge className="bg-green-900/30 text-green-400 hover:bg-green-900/40">
                    <UserCheck size={12} className="mr-1" />
                    Check-in
                  </Badge>
                ) : (
                  <Badge className="bg-yellow-900/30 text-yellow-400 hover:bg-yellow-900/40">
                    <UserX size={12} className="mr-1" />
                    Pendiente
                  </Badge>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-zinc-400">
                <div className="flex items-center gap-1">
                  <Mail size={12} />
                  <span>{attendee.profile.email}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Ticket size={12} />
                  <span>{attendee.ticket_class_name}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Calendar size={12} />
                  <span>Creado {new Date(attendee.created).toLocaleDateString("es-UY")}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AttendeesPage() {
  return (
    <AdminAuthWrapper>
      <Suspense
        fallback={
          <div className="w-full p-6">
            <Skeleton className="h-32 w-full bg-zinc-800" />
          </div>
        }
      >
        <AttendeesContent />
      </Suspense>
    </AdminAuthWrapper>
  );
}
