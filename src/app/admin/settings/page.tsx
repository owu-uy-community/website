import { requireAdmin } from "app/lib/auth-helpers";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "components/shared/ui/card";

export default async function AdminSettingsPage() {
  // Validate admin access and get session
  const session = await requireAdmin();

  return (
    <div className="w-full p-6">
      <div className="mb-8">
        <h1 className="mb-2 text-3xl font-bold text-white">Configuración</h1>
        <p className="text-zinc-400">Ajustes del panel de administración</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="border-zinc-800 bg-zinc-900">
          <CardHeader>
            <CardTitle className="text-white">Información de la cuenta</CardTitle>
            <CardDescription>Detalles del usuario administrador</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <p className="mb-1 text-sm text-zinc-400">Email</p>
                <p className="text-white">{session.user.email}</p>
              </div>
              <div>
                <p className="mb-1 text-sm text-zinc-400">Nombre</p>
                <p className="text-white">{session.user.name || "Sin nombre"}</p>
              </div>
              <div>
                <p className="mb-1 text-sm text-zinc-400">Rol</p>
                <p className="text-white">Administrador</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-zinc-800 bg-zinc-900">
          <CardHeader>
            <CardTitle className="text-white">Configuración del evento</CardTitle>
            <CardDescription>Ajustes generales de La Meetup 2025</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <p className="mb-1 text-sm text-zinc-400">Nombre del evento</p>
                <p className="text-white">La Meetup 2025</p>
              </div>
              <div>
                <p className="mb-1 text-sm text-zinc-400">Fecha</p>
                <p className="text-white">1 de noviembre 2025</p>
              </div>
              <div>
                <p className="mb-1 text-sm text-zinc-400">Estado</p>
                <p className="text-green-500">Activo</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-zinc-800 bg-zinc-900">
          <CardHeader>
            <CardTitle className="text-white">OpenSpace</CardTitle>
            <CardDescription>Configuración del OpenSpace</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <p className="mb-1 text-sm text-zinc-400">Modo de sincronización</p>
                <p className="text-white">Tiempo real (Supabase)</p>
              </div>
              <div>
                <p className="mb-1 text-sm text-zinc-400">Sesiones totales</p>
                <p className="text-white">24 sesiones</p>
              </div>
              <div>
                <p className="mb-1 text-sm text-zinc-400">Salas activas</p>
                <p className="text-white">5 salas</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-zinc-800 bg-zinc-900">
          <CardHeader>
            <CardTitle className="text-white">Pantalla</CardTitle>
            <CardDescription>Configuración de la pantalla principal</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <p className="mb-1 text-sm text-zinc-400">Resolución</p>
                <p className="text-white">1920x1080</p>
              </div>
              <div>
                <p className="mb-1 text-sm text-zinc-400">Estado</p>
                <p className="text-green-500">Conectado</p>
              </div>
              <div>
                <p className="mb-1 text-sm text-zinc-400">Escena actual</p>
                <p className="text-white">OpenSpace</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
