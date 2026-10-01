# Defensa — Marchas entrantes y datos de tropas

Análisis de los paquetes de atalaya/defensa. Implementado en `backend/src/models/march-incoming.ts`, `march-update.ts`, `march-packet.ts` y en `bot-instance.ts`.

## Proto 2440 — Marcha entrante (servidor → cliente)

Tamaño fijo 24 bytes:

| Offset | Bytes | Descripción |
|--------|-------|-------------|
| 0 | `1c 00 88 09` | Header `[len=0x1c][proto=0x0988=2440]` |
| 4 | `?? ?? ?? ??` | ID de la marcha (u32 LE) |
| 8 | `?? ??` | Tipo de marcha: `ff 05` = ataque, `ff 08` = exploración |
| 10 | `?? ?? ?? ??` | Timestamp de llegada |
| 14 | `00 00 00 00` | ?? |
| 18 | `?? ?? ?? ??` | ¿Cantidad/slot? (varía: 0x0a, 0x32, 0x6f, 0x78...) |
| 22 | `00 00` | ?? |

Ejemplo (ataque):

```
1c008809 5cf10800 05ff f897666a 00000000 32000000 0000
```

> En la práctica el bot usa `seconds` (tiempo restante) en vez del timestamp absoluto para calcular la llegada: `arrivalTimestamp = now + seconds`.

## Proto 2445 — Consultar datos de tropas (cliente → servidor)

```
[ID de marcha: u32 LE]   (8 bytes total con header)
```

Ejemplo: `plain=2800 0900` → `enc=0c008d0905a8ff6d` (primeros 8 bytes cifrados DES).

## Proto 2446 — Datos de tropas de la marcha (servidor → cliente)

Tamaño 160 bytes. Estructura:

```
a4 00 8e 09 05             = header [len=0xa4][proto=0x098e=2446] + count? (5 bytes)
19 eb 00 69 4d 78 4e 65 77 00 00 00 00  = Nombre del jugador (13 bytes, null-terminated)
00 00 00                   = Tag del gremio (3 bytes)
00 75 46 4f 2b 0c          = ?? (6 bytes, sin interpretar)
01 00 00 00                = Cantidad total de tropas
05                         = Cantidad de héroes
08                         = Tipos de tropas presentes (máscara: 256, 512, 1024, 2048)
00                         = ?? (sin interpretar)
05                         = ¿Con líder? 05 = sin líder, 00 = con líder
```

### Byte 0: lineType (EWATCHTOWER_LINE_TYPE)

El **primer byte del body** identifica el TIPO de marcha — es el campo que
distingue un ataque de un refuerzo:

| lineType | Significado | Tropas parseadas |
|----------|-------------|------------------|
| `05` | **Ataque** | sí (layout completo) |
| `08` | Exploración | no |
| `0a` (10) | **Refuerzo** (aliado) — ej. captura "TOKAI  TEIO" tag uFO | no |
| `0c` (12) | Rally | no |

El parser (`march.parser.ts`) sólo arma tropas con `lineType=5`; el resto va
por `parseScoutOrShort()` con 0 tropas. `counter-logic.ts:armCounter()`
descarta cualquier marcha con `lineType !== 5` antes de calcular la amenaza
(log `[CONTRA] … no es ataque, no se counterea`).

### Tropas (16 columnas × 4 bytes)

Las 4 columnas primeras son infantería T1-T4, luego artillería, luego caballería, luego asedio:

```
00000000 00000000 00000000 01000000   infantería
00000000 00000000 00000000 00000000   artillería
00000000 00000000 00000000 00000000   caballería
00000000 00000000 00000000 00000000   asedio
```

### Héroes (10 bytes por entrada)

```
1700 0f00 0900 0400 0200     = IDs de héroes (5 × u16)
08 05 08 05 08 05 08 05      = [rango, grado] por héroe
```

### Buffs "monstruos" (12 bytes)

```
2b04 = debuff 10%
042b 003a 002e 0028 0000
```

### T5 y resto

Después vienen las tropas T5 (misma estructura: inf/art/cab/asedio de 4 bytes) y ~20 bytes finales sin interpretar.

## Significados de las máscaras de tropas

| Valor (u16) | Significado |
|-------------|-------------|
| `0001` | T1 256 |
| `0002` | T2 512 |
| `0004` | T3 1024 |
| `0008` | T4 2048 |
| `0000` | sin tropas de ese tipo |

Si se envían 2 pares (p. ej. T1+T2) se suma: 256 + 512 = 768 (el valor es la suma de los tipos presentes).

## Notas de sesión

- `f5 f0 0d00 19` en `construccion.md` no aplica aquí (ver [`construcciones.md`](construcciones.md)).
- El bot, al recibir 2440, envía 2445 con el marchId para pedir los datos y luego vincula el 2446 correspondiente (ver `checkExpiredMarches` y los handlers de 2440/2445/2446 en `bot-instance.ts`).
