"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "components/shared/ui/card";
import { LayoutGrid, Monitor, Users, Music2 } from "lucide-react";
import { client } from "../../lib/orpc/client";

export default function DashboardClient() {
  // Fetch dashboard statistics using orpc
  const { data: stats, isLoading } = useQuery({
    queryKey: ["dashboard", "stats"],
    queryFn: async () => {
      return await client.dashboard.getStats();
    },
    staleTime: 30000, // 30 seconds
    refetchInterval: 60000, // Refetch every minute
  });

  // Display loading state or default values
  const totalSessions = stats?.totalSessions ?? 0;
  const activeRooms = stats?.activeRooms ?? 0;
  const totalParticipants = stats?.totalParticipants ?? 0;
  const checkedInParticipants = stats?.checkedInParticipants ?? 0;
  const openSpaceStatus = stats?.openSpaceStatus ?? "inactive";
  const eventName = stats?.eventName ?? "La Meetup 2025";

  // Map status to display text and color
  const statusDisplay = {
    active: { text: "Activo", color: "text-green-500" },
    upcoming: { text: "Próximamente", color: "text-yellow-500" },
    inactive: { text: "Inactivo", color: "text-zinc-500" },
  };

  return (
    <div className="w-full p-6">
      <div className="mb-8">
        <h1 className="mb-2 text-3xl font-bold text-white">Panel de Administración</h1>
        <p className="text-zinc-400">Gestiona el evento {eventName}</p>
      </div>

      <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Link href="/admin/openspace" className="group block">
          <Card className="h-full border-zinc-800 bg-zinc-900 transition-colors hover:bg-zinc-800">
            <CardHeader>
              <CardTitle className="flex items-center text-white transition-colors group-hover:text-yellow-400">
                <LayoutGrid className="mr-2 h-5 w-5 text-yellow-400 transition-colors group-hover:text-yellow-400" />
                OpenSpace
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-zinc-400">Gestiona las sesiones del OpenSpace, arrastra y organiza las charlas</p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/admin/screen" className="group block">
          <Card className="h-full border-zinc-800 bg-zinc-900 transition-colors hover:bg-zinc-800">
            <CardHeader>
              <CardTitle className="flex items-center text-white transition-colors group-hover:text-yellow-400">
                <Monitor className="mr-2 h-5 w-5 text-yellow-400 transition-colors group-hover:text-yellow-400" />
                Pantalla
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-zinc-400">Control de la pantalla principal del evento y visualización</p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/admin/launchpad" className="group block">
          <Card className="h-full border-zinc-800 bg-zinc-900 transition-colors hover:bg-zinc-800">
            <CardHeader>
              <CardTitle className="flex items-center text-white transition-colors group-hover:text-yellow-400">
                <Music2 className="mr-2 h-5 w-5 text-yellow-400 transition-colors group-hover:text-yellow-400" />
                Launchpad
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-zinc-400">Control de sonidos para reproducir efectos durante el evento</p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/admin/attendees" className="group block">
          <Card className="h-full border-zinc-800 bg-zinc-900 transition-colors hover:bg-zinc-800">
            <CardHeader>
              <CardTitle className="flex items-center text-white transition-colors group-hover:text-yellow-400">
                <Users className="mr-2 h-5 w-5 text-yellow-400 transition-colors group-hover:text-yellow-400" />
                Participantes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-zinc-400">Gestiona los asistentes del evento y el check-in</p>
            </CardContent>
          </Card>
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="border-zinc-800 bg-zinc-900 lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-white">Resumen del Sistema</CardTitle>
            <CardDescription>Estado actual de la plataforma</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-4">
                <div className="h-12 animate-pulse rounded bg-zinc-800"></div>
                <div className="h-12 animate-pulse rounded bg-zinc-800"></div>
                <div className="h-12 animate-pulse rounded bg-zinc-800"></div>
                <div className="h-12 animate-pulse rounded bg-zinc-800"></div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-start">
                  <div
                    className={`mr-3 mt-2 h-2 w-2 rounded-full ${openSpaceStatus === "active" ? "bg-green-500" : openSpaceStatus === "upcoming" ? "bg-yellow-500" : "bg-zinc-500"}`}
                  ></div>
                  <div className="flex-1">
                    <p className="font-medium text-white">Estado del Evento</p>
                    <p className="text-sm text-zinc-400">
                      {statusDisplay[openSpaceStatus].text} - {eventName}
                    </p>
                  </div>
                </div>
                <div className="flex items-start">
                  <div className="mr-3 mt-2 h-2 w-2 rounded-full bg-green-500"></div>
                  <div className="flex-1">
                    <p className="font-medium text-white">Sesiones del OpenSpace</p>
                    <p className="text-sm text-zinc-400">
                      {totalSessions} {totalSessions === 1 ? "sesión configurada" : "sesiones configuradas"}
                    </p>
                  </div>
                </div>
                <div className="flex items-start">
                  <div className="mr-3 mt-2 h-2 w-2 rounded-full bg-blue-500"></div>
                  <div className="flex-1">
                    <p className="font-medium text-white">Salas Disponibles</p>
                    <p className="text-sm text-zinc-400">
                      {activeRooms} {activeRooms === 1 ? "sala activa" : "salas activas"}
                    </p>
                  </div>
                </div>
                <div className="flex items-start">
                  <div className="mr-3 mt-2 h-2 w-2 rounded-full bg-purple-500"></div>
                  <div className="flex-1">
                    <p className="font-medium text-white">Check-in de Participantes</p>
                    <p className="text-sm text-zinc-400">
                      {checkedInParticipants} de {totalParticipants} participantes registrados
                    </p>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-zinc-800 bg-zinc-900">
          <CardHeader>
            <CardTitle className="text-white">Estadísticas</CardTitle>
            <CardDescription>Resumen del evento</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-4">
                <div className="h-4 animate-pulse rounded bg-zinc-800"></div>
                <div className="h-4 animate-pulse rounded bg-zinc-800"></div>
                <div className="h-4 animate-pulse rounded bg-zinc-800"></div>
                <div className="h-4 animate-pulse rounded bg-zinc-800"></div>
                <div className="h-4 animate-pulse rounded bg-zinc-800"></div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-zinc-400">Sesiones totales:</span>
                  <span className="font-medium text-white">{totalSessions}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-zinc-400">Salas activas:</span>
                  <span className="font-medium text-white">{activeRooms}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-zinc-400">Participantes:</span>
                  <span className="font-medium text-white">{totalParticipants}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-zinc-400">Check-in:</span>
                  <span className="font-medium text-white">{checkedInParticipants}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-zinc-400">Estado:</span>
                  <span className={`font-medium ${statusDisplay[openSpaceStatus].color}`}>
                    {statusDisplay[openSpaceStatus].text}
                  </span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
