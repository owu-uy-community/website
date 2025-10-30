import { requireAdmin } from "app/lib/auth-helpers";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "components/shared/ui/card";
import { LayoutGrid, Monitor, Users, Calendar, Music2 } from "lucide-react";

export default async function AdminDashboardPage() {
  // Validate admin access
  await requireAdmin();

  return (
    <div className="w-full p-6">
      <div className="mb-8">
        <h1 className="mb-2 text-3xl font-bold text-white">Panel de Administración</h1>
        <p className="text-zinc-400">Gestiona el evento La Meetup 2025</p>
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

        <Card className="h-full border-zinc-800 bg-zinc-900 opacity-50">
          <CardHeader>
            <CardTitle className="flex items-center text-white">
              <Users className="mr-2 h-5 w-5 text-yellow-400" />
              Participantes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-zinc-400">Próximamente - Gestión de participantes</p>
          </CardContent>
        </Card>

        <Card className="h-full border-zinc-800 bg-zinc-900 opacity-50">
          <CardHeader>
            <CardTitle className="flex items-center text-white">
              <Calendar className="mr-2 h-5 w-5 text-yellow-400" />
              Agenda
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-zinc-400">Próximamente - Gestión de la agenda del evento</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="border-zinc-800 bg-zinc-900 lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-white">Actividad Reciente</CardTitle>
            <CardDescription>Últimas acciones en el panel</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-start">
                <div className="mr-3 mt-2 h-2 w-2 rounded-full bg-yellow-500"></div>
                <div>
                  <p className="font-medium text-white">OpenSpace actualizado</p>
                  <p className="text-sm text-zinc-400">Hace 5 minutos</p>
                </div>
              </div>
              <div className="flex items-start">
                <div className="mr-3 mt-2 h-2 w-2 rounded-full bg-green-500"></div>
                <div>
                  <p className="font-medium text-white">Nueva sesión agregada</p>
                  <p className="text-sm text-zinc-400">Hace 15 minutos</p>
                </div>
              </div>
              <div className="flex items-start">
                <div className="mr-3 mt-2 h-2 w-2 rounded-full bg-blue-500"></div>
                <div>
                  <p className="font-medium text-white">Pantalla actualizada</p>
                  <p className="text-sm text-zinc-400">Hace 1 hora</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-zinc-800 bg-zinc-900">
          <CardHeader>
            <CardTitle className="text-white">Estadísticas</CardTitle>
            <CardDescription>Resumen del evento</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-zinc-400">Sesiones totales:</span>
                <span className="font-medium text-white">24</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-400">Salas activas:</span>
                <span className="font-medium text-white">5</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-400">Participantes:</span>
                <span className="font-medium text-white">243</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-400">Estado:</span>
                <span className="font-medium text-green-500">Activo</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
