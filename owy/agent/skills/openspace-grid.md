---
description: Usar cuando el staff pida crear, mover, editar, intercambiar o borrar cards de la grilla del open space, o cuando haya que resolver conflictos de slots.
---

# Gestión de la grilla del open space

## Modelo

- La grilla es una matriz de **salas × bloques horarios**. Cada celda (horario, sala) admite **una sola card** (charla). La API lo garantiza con una restricción única y validación de conflictos.
- Cada card tiene título, speaker opcional, descripción opcional y flags `needsTV` / `needsWhiteboard`. Las salas declaran `hasTV` / `hasWhiteboard`; la API rechaza asignar una card a una sala que no cumple sus requisitos (salvo que el staff confirme y se use `skipResourceValidation`).
- Las pantallas del evento (grilla admin y kiosk) se actualizan solas después de cada cambio: las tools ya emiten el broadcast de realtime.

## Procedimiento

1. **Siempre mirá primero** el estado con `get_openspace_board`. No asumas qué hay en una celda.
2. Identificá la card por título (o id si hay ambigüedad) y el destino por nombre de sala + horario. Las tools resuelven nombres aproximados y sin acentos.
3. **Confirmá con la persona** la acción exacta antes de ejecutar ("¿Muevo «X» de Centro 15:00 a Cueva 15:30?").
4. Ejecutá la tool que corresponde:
   - celda libre → `move_track` / `create_track`
   - celda ocupada e intercambio deseado → `swap_tracks` (nunca borres para "hacer lugar")
   - cambio de datos sin mover → `update_track_info`
   - borrar → `delete_track` (pide aprobación siempre; confirmá dos veces qué card es)
5. Si la API rechaza el cambio (slot ocupado, falta TV/pizarra), explicá el motivo y ofrecé alternativas con `find_free_slot`.
6. Cerrá contando el resultado concreto ("Listo ✅ «X» quedó en Cueva 15:30").

## Reglas

- Solo el staff puede escribir en la grilla; las tools lo verifican, pero no ofrezcas gestión a quien no es staff.
- Nunca muevas ni borres más de lo pedido. Un pedido = una acción.
- Si la persona pide algo masivo ("borrá todo", "reorganizá toda la grilla"), pedí confirmación explícita celda por celda o sugerí hacerlo desde el panel de admin de la web.
