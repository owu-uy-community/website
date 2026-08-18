---
description: Usar cuando el staff pida algo del tablero de tareas del día - ver qué falta, crear o mover tareas, cambiar estados, asignar gente, correr horarios o mandar un aviso interno.
---

# Coordinación del staff (día del evento)

El sitio tiene un tablero de tareas por evento: cada tarea tiene día, horario, lugar, cuánta gente hace falta, quiénes están asignados y un estado. Además hay avisos internos con confirmación de lectura.

## Procedimiento

1. **Mirá primero** con `get_staff_tasks`. Filtros útiles: `today: true` (lo de hoy), `pendingOnly: true` (lo que falta), `status`. La respuesta trae también el **roster** con los `userId`, que es lo que necesitás para asignar.
2. Identificá la tarea por título (o id si hay ambigüedad) y la persona por nombre (o userId).
3. **Confirmá la acción** antes de ejecutarla, y contá el resultado después. Para lo que afecta a mucha gente — `shift_staff_tasks`, `announce_to_staff`, borrar una tarea — confirmá con `ask_question` (opciones cortas tipo `Dale` / `Mejor no`) en vez de asumir.
4. Usá la tool que corresponde:
   - crear / editar / cambiar estado / asignar / desasignar / borrar → `manage_staff_task`
   - correr en bloque los horarios de un día → `shift_staff_tasks`
   - publicar un aviso al staff → `announce_to_staff`

## Cosas que pasan seguido

- **"¿Qué falta ahora?"** → `get_staff_tasks` con `today: true, pendingOnly: true`. Resumí por horario; marcá las que tienen `understaffed: true` (menos gente de la que pide la tarea).
- **"Marcá X como hecha"** → `manage_staff_task` con `action: "set_status"`, `status: "done"`.
- **"Falta gente en la puerta"** → mirá `understaffed` y proponé a quién asignar según quién tiene menos tareas en ese horario.
- **"Vamos 15 minutos tarde"** → `shift_staff_tasks` con `fromTime` (desde qué hora) y `deltaMinutes: 15`. Afecta muchas tareas: confirmá día, hora de corte y minutos antes de ejecutar.
- **"Avisale a todos que…"** → `announce_to_staff`. Redactá vos el mensaje, corto y claro; marcá `urgent` solo si de verdad lo es. Si es para una tarea puntual, pasá `task` y les llega solo a quienes están asignados.
- **"¿Quién no se enteró?"** → `get_staff_announcements`: cada aviso trae `pending` (quiénes todavía no confirmaron).

## Reglas

- Todo esto es **interno del staff**: no compartas tareas, nombres, roster ni avisos con asistentes.
- Los avisos se los mandás a personas reales: leé el texto y confirmá con `ask_question` antes de publicar; no repitas uno que ya salió.
- Los horarios son hora de Uruguay; los días van como `YYYY-MM-DD` y por defecto es hoy.
- Una acción por pedido: no reorganices el tablero entero por tu cuenta.
