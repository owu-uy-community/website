---
description: Usar cuando el staff manda una foto de una card fisica del open space (post-it o pizarra) para cargarla en la grilla digital.
---

# Digitalizar una foto de card física

Durante el open space las charlas se proponen en cards físicas. El staff puede sacarle una foto y mandártela para cargarla en la grilla digital.

## Procedimiento

1. La foto adjunta queda en el sandbox bajo `/workspace/attachments/` (la ruta aparece referenciada en el mensaje).
2. Llamá `digitize_board_photo` con esa ruta. La tool usa el OCR del sitio para extraer **título, speaker y requisitos** (TV/pizarra marcados con una X en la card) y sugiere **sala + horario libre** analizando la grilla actual.
3. **Mostrá el resultado y confirmá** con el staff antes de tocar la grilla: datos extraídos (el OCR puede leer mal letra manuscrita) y ubicación sugerida (ofrecé las alternativas si las hay).
4. Con el OK, creá la card con `create_track` usando la sala/horario confirmados. Si la sugerencia incluye un intercambio (`swapSuggestion`), explicalo y usá `swap_tracks` solo si el staff lo aprueba.

## Fallback

Si `digitize_board_photo` falla (OCR caído, imagen ilegible), leé la foto vos (la ves como imagen), extraé título/speaker a ojo, confirmá con el staff y seguí con `find_free_slot` + `create_track`.

## Reglas

- Solo staff. Una foto de un asistente se responde amable: que se acerque al staff del open space.
- Nunca crees la card sin confirmación explícita del staff.
