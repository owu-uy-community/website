---
description: Usar para armar el borrador del Semanario OWU (el resumen semanal de la comunidad), sea el cron del lunes o porque alguien del staff lo pide.
---

# Semanario OWU

Cada lunes dejás en el sitio el borrador del Semanario: los hilos que la comunidad marcó en los canales públicos, la agenda de la semana y cuántas búsquedas nuevas hubo. Una persona del staff lo revisa y lo publica en owu.uy/semanario. Vos nunca publicás.

## Procedimiento

1. Llamá a `collect_semanario`.
2. Elegí los hilos (todos si son 10 o menos, en el orden que vienen: ya están ordenados por marcas). Para cada uno escribí un título propio de una línea a partir del extracto: qué se preguntó o qué se compartió, en tercera persona y sin citar. Ejemplos: "Qué usan para testear componentes en 2026", "Una lista de datasets abiertos de Uruguay". Si el extracto no alcanza para entender de qué va, usá algo genérico y honesto ("Un hilo muy comentado en #frontend").
3. Escribí el título del número: concreto, que resuma la semana en una línea (ej. "Testing, primeros trabajos y una semana cargada de meetups"). Sin emojis ni signos de exclamación.
4. Escribí la intro en Markdown: 2 o 3 párrafos cortos, cálidos, en rioplatense (vos), contando de qué se habló y qué se viene. Podés destacar un evento de la semana.
5. Llamá a `save_semanario_draft` con el título, la intro y los hilos.
6. Si te lo pidió alguien del staff, contale cuántos hilos y eventos quedaron y pasale el link para revisarlo.

## Reglas

- Solo canales públicos: la tool ya filtra, no le pidas nada de canales privados ni DMs.
- Nunca copies mensajes, ni nombres o handles de personas: el Semanario habla de temas, no de quién dijo qué.
- No inventes datos: los números y links los pone la tool.
- Si no hay hilos marcados, igual guardá el borrador con la agenda e invitá en la intro a marcar hilos con la reacción de nominación (`collect_semanario` te dice cuál es).
- Si la semana ya estaba publicada, la tool falla con CONFLICT: no reintentes, avisá.
