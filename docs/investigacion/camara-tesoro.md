# Cámara del tesoro

## Estado (proto 4201)

Estructura del paquete 4201. Implementado en `backend/src/models/treasure-chamber.ts` (parseTreasureChamber).

```
09          = byte 01: nivel de la cámara del tesoro
f8a7        = byte 02-03: cantidad de gemas invertidas (u16 LE)
286a536a    = byte 04-07: timestamp de inicio (u32 LE)
00000000    = byte 08-11: vacío
03          = byte 12: tipo (01 = 7 días, 02 = 14 días, 03 = 30 días)
```

## Invertir (proto 4202)

Comando **cliente → servidor**. Body (sin seq, 3 bytes): `[gemas u16 LE][slot u8]`.

| Bytes | Campo |
|-------|-------|
| 0-1 | gemas a invertir (`uint16` little-endian) |
| 2 | slot de duración: `01` = 7d, `02` = 14d, `03` = 30d |

Ejemplo paquete completo (seq `15000000` + `264d03`):

```
15000000 264d03   → 19.750 gemas, slot 30 días
```

## Reclamar (proto 4206)

Comando **cliente → servidor**. Sin body (solo seq).

```
0f000000   → solo seq
```

## Máximo de depósito por nivel

| Nivel | Máximo de gemas |
|-------|-----------------|
| 1 | 10.250 |
| 2 | 10.500 |
| 3 | 11.000 |
| 4 | 12.000 |
| 5 | 13.000 |
| 6 | 14.000 |
| 7 | 15.000 |
| 8 | 16.000 |
| 9 | 20.000 |

El nivel del edificio se obtiene con `getBuildingLevel(BuildingId.TreasureTrove)` (`building-state.ts`).

## Uso en el bot

`BotInstance` parsea 4201 al recibirlo y emite `treasureChamberUpdated`. El modelo `treasure-chamber.ts` también calcula:

- `getRoiPercent()` — retorno de inversión (base + bonus por nivel)
- `getReturnGems()` — gemas devueltas (ganancia)
- `getTotalPayout()` — pago total (capital + ganancia)
- `getMaxDeposit()` — máximo de gemas invertibles según el nivel

La acción `TreasureChamberAction` (cuando `treasureChamber.enable` está activo) reclama la inversión vencida con `4206` (sumando las gemas al cache) y reinvierte con `4202` en el slot de 30 días (restando las gemas del cache).

Se expone en la UI vía `getRunningBots` / `getBotData`.
