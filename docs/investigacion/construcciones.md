# Construcciones (proto 2002)

Estructura de la respuesta de construcciones/edificios. Implementado en `backend/src/models/construction.ts` (parse2002) y `models/building-state.ts` (parse2001).

## Formato

```
45              = número de construcciones
f5 f0 0d00 19   = [ubicación: 3 bytes][nivel: 2 bytes LE]
0a20 05 001e
f3df 01 001e
...
```

Cada entrada: **ID de ubicación (3 bytes) + nivel de construcción (2 bytes LE, `001e` = 30, `0019` = 25, `0001` = 1, `001b` = 27, `001c` = 28, etc.)**.

```
f5e1 0300 19 afc3586a 000000000b8b1500318c736a00000000
```

El último bloque incluye timestamps (paquete con datos de construcción activa).

## Dónde se usa

- `backend/src/models/building-state.ts` — `parse2001` (proto 2001) carga la lista de construcciones en `BuildingState.buildings`.
- `backend/src/models/construction.ts` — `parse2002` (proto 2002) con `ConstructionsData` (construcciones activas con `remainingSeconds`).
- El bot loguea construcciones activas con nombre de edificio (tabla `BuildingId`) y tiempo restante.

## Nota

Los IDs de edificios provienen del paquete 3402/3201 (`[count:1][id:4][flag:1]×count`), que el bot necesita para la secuencia de init (ver [`autenticacion.md`](autenticacion.md)).
