# Guerra — Agrupaciones y envío de tropas

Flujo para detectar guerras (castillos, torres, fortalezas) y enviar tropas. Implementado en `backend/src/services/war-detector.ts` y `bot-instance.ts`.

## Paquetes de guerra

| Proto | Dirección | Descripción |
|-------|-----------|-------------|
| 2476 | C → S | Abrir apartado de guerra (payload vacío) |
| 2477 | S → C | Agrupaciones **restantes** que quedan (uint32 LE) |
| 2478 | S → C | Respuesta: guerras activas a **castillos** |
| 2479 | S → C | Terminó/canceló la agrupación en esa **posición** (uint32 = index * 256) |
| 6611 | S → C | Respuesta: guerras activas a **torres** |
| 7315 | S → C | Respuesta: guerras activas a **fortalezas** |
| 2481 | S → C | Confirmación de ventana de guerra |
| 2485 | S → C | Confirmación de guerra |
| 1144 | C → S | Acción / selección de guerra |
| 2472 | C → S | Envío de tropas a la guerra |

## Flujo completo para unirse a una guerra

```
1. Bot envía 2476 (abrir guerra)
2. Server responde con 2478/6611/7315 (lista de guerras activas)
3. Bot envía 1144 acción 11 (seleccionar pestaña)
4. Bot envía 1144 con index * 256 (seleccionar guerra por posición)
5. Server responde 2481 (confirmación)
6. Bot envía 2472 con tropas
```

El **índice** se calcula por **menor tiempo restante**: la guerra con menos tiempo es index 0, la siguiente index 1, etc.

---

## 2478 — Guerras a castillos

### Payload (S → C)

```
Header (6 bytes):
  [0-1] uint16  = cantidad de entradas
  [2-5] padding

Cada entrada (58 bytes):
  [0-3]   uint32  = timestamp de inicio (unix seconds)
  [4-7]   uint32  = padding
  [8-9]   uint16  = tiempo restante (segundos)
  [10-11] uint16  = padding
  [12-14] 3 bytes  = PointCode (zoneID: u16 LE + pointID: u8)
                    → decodeCoordBytes() de map-coords.ts
  [15-16] uint16  = AllyHead (warlord ID del rally leader)
  [17-29] char[13]= AllyName (null-padded, rally initiator)
  [30-44] bytes   = campos entre nombres:
                      AllyVIP(u8), AllyRank(u8), AllyCurrTroop(u32),
                      AllyMAXTroop(u32), AllyNameID(u32), AllyHomeKingdom(u16)
  [45-57] char[13]= EnemyName (null-padded, enemigo/rally target)
```

### Ejemplo real

```
Payload: 020000000000 + entradas...
Header: cantidad=2, padding=0
```

---

## 6611 — Guerras a torres

### Payload (S → C)

Misma estructura que 2478 pero sin el segundo nombre:

```
Header (6 bytes):
  [0-1] uint16  = cantidad de entradas
  [2-5] padding

Cada entrada:
  [0-3]  uint32  = timestamp de inicio (unix seconds)
  [4-7]  uint32  = padding
  [8-11] int32   = tiempo restante (segundos)
  [12-13] uint16 = coordenada X
  [14-15] uint16 = coordenada Y
  [16]    uint8  = padding
  [17-N]  string = nombre del enemigo (null-terminated)
  [N+1]   uint8  = separador
  [N+2+]  uint8[] = zeros de padding (hasta siguiente entrada)
```

---

## 7315 — Guerras a fortalezas

### Payload (S → C)

Estructura diferente a 2478/6611. Sin header fijo; **cada entrada = 53 bytes**.
Spec completa en [`../protocols/7315.md`](../protocols/7315.md).

```
Cada entrada (53 bytes):
  [0-3]   uint32 = 00000000 (padding)
  [4]     uint8  = flag de estado (00 = en espera, 01 = en marcha)
  [5-8]   uint32 = timestamp de inicio (unix seconds, LE)
  [9-12]  uint32 = 00000000 (padding)
  [13-14] uint16 = tiempo restante en segundos (LE)
  [15-16] uint16 = 0000 (padding)
  [17-19] bytes  = ubicación 3 bytes (⚠ sin determinar; NO es pad ni iconType)
  [20-21] uint16 = id del ícono del atacante (LE)
  [22-34] string = nombre del atacante (13 bytes, null-padded, sin separador posterior)
  [35-36] uint16 = sub-tipo (ej: 0f03) ⚠ sin investigar
  [37-40] uint32 = tropas actuales (LE)
  [41-44] uint32 = capacidad máxima (LE)
  [45-46] uint16 = reino (LE, ej: cf04 = 1231)
  [47-49] bytes  = ubicación de la FORTALEZA (3 bytes)
  [50]    uint8  = nivel de la fortaleza
  [51-52] uint16 = 0100 ⚠ sin investigar
```

### Campos importantes

| Offset | Tamaño | Campo | Descripción |
|--------|--------|-------|-------------|
| 4 | 1 | flag | `01` = en marcha, `00` = en espera → `WarEvent.inMarch` |
| 5-8 | 4 | timestamp | Cuándo empezó la agrupación |
| 13-14 | 2 | timeRemaining | Segundos restantes |
| 17-19 | 3 | locOrigen | Ubicación sin determinar |
| 22-34 | 13 | rallyLeader | Nombre del atacante (null-padded) |
| 37-40 | 4 | troopsCurrent | Tropas actuales |
| 41-44 | 4 | troopsMax | Capacidad máxima |
| 45-46 | 2 | kingdom | Reino del jugador |
| 47-49 | 3 | locFortaleza | **Se usa como coordX/coordY del grupo** |
| 50 | 1 | level | Nivel de la fortaleza |

### Ejemplo real (hex)

```
00000000 pad | 01 flag(en marcha) | 670db76a ts | 00000000 pad
1500 timeRem(21s) | 0000 pad | 270274 loc(17-19) | 260c iconId
4e6967687444726167306e3300 nombre="NightDrag0n3"
0f03 subType | 22282400 tropas | 40282400 max | cf04 reino
270263 loc fortaleza | 06 nivel | 0100 ?
```

---

## 1144/2480 — Acción y selección de guerra

### 1144: Acción 11 (seleccionar pestaña)

```
Payload: [11 00 00 00] [seq] [00]
```

Envía el número 11 como uint32 LE, seguido de un byte de secuencia y un padding.

### 2480: Selección por índice

```
Payload: [index * 256] [00 00]
```

El índice se multiplica por 256 (shift left 8 bits). Ejemplo:
- Index 0 → `00000000`
- Index 1 → `00010000`
- Index 2 → `00020000`

### Envío real desde el bot (`bot-instance.ts`)

```typescript
// Acción 11 (proto 1144)
warSelectAction11() {
  const payload = Buffer.alloc(6);
  payload.writeUInt32LE(11, 0);
  this.bot.sendCommandPacket(1144, payload, true);
}

// Seleccionar índice (proto 2480)
warSelectIndex(index: number) {
  const payload = Buffer.alloc(6);
  payload.writeUInt32LE(index * 256, 0);
  this.bot.sendCommandPacket(2480, payload, true);
}
```

---

## 2472 — Envío de tropas

### Payload (C → S)

```
[0-3]   uint32 = secuencia
[4-N]   string = nombre del enemigo (null-terminated)
[N+1-N+3] = padding (3 bytes)
[N+4-N+7] uint32 = máscara de tropas (tipo + tier)
[N+8-N+11] uint32 = cantidad infantería
[N+12-N+15] uint32 = cantidad artillería (si aplica)
[N+16-N+19] uint32 = cantidad caballería (si aplica)
[final]  uint8 = 00 (fin)
```

### Máscara de tropas (tipo + tier)

| Tipo | T1 | T2 | T3 | T4 | T5 |
|------|----|----|----|----|-----|
| Infantería | 1 | 16 | 256 | 4096 | — |
| Artillería | 2 | 32 | 512 | 8192 | — |
| Caballería | 4 | 64 | 1024 | 16384 | — |

- Sumar valores para mezclar: inf T4 + art T4 = 4096 + 8192 = 12288
- Por cada bit en la máscara va un campo de cantidad (orden: inf → art → cab)
- T4 + T5 (delegación): primero T5, luego T4

### Ejemplo

```
44 65 6e 69 73 20 33 33 37 00  = "Denis 337\0"
00 00 00                       = padding
00 10 00 00                    = máscara 4096 (INF T4)
01 00 00 00                    = 1 infantería
00                             = fin
```

---

## Tipos de agrupaciones

| Proto | Tipo | Estado |
|-------|------|--------|
| 2478 | Castillos | ✅ Implementado (`handle2478`) |
| 6611 | Torres | ✅ Implementado (`handle6611`) |
| 7315 | Fortalezas | ✅ Implementado (`handle7315`) |

---

## Anti-contra en `checkExpiredMarches` (guerra defensiva)

Cuando `warMode=true` y una marcha llega en ≤2s:

- Calcula peso ponderado de tropas por tier: T1/T2 = 0, T3 = 0.3, T4 = 1, T5 = 1.5
- Umbral mínimo: 250k ponderado (menos se ignora)
- Determina el tipo dominante y aplica la falange contraria con `6801`:

| Tipo enemigo | Falange contraria (proto 6801) |
|--------------|--------------------------------|
| 0 infantería | 4 (cuña de arqueros) |
| 1 artillería | 5 (cuña de caballería) |
| 2 caballería | 3 (cuña de infantería) |

- Cambia traje a predefinido con `6102` (index 1)
- Al llegar la marcha, revierte falange (03) y traje (index 0)
- Asedio (tipo 3) se ignora

---

## Notas técnicas

- El **índice** se recalcula cada vez que llega una nueva lista (2478/6611)
- Las **fortalezas (7315)** llegan 1 paquete por entrada y se numeran por orden de llegada
- `2479` elimina la agrupación de esa posición (mismo encoding index*256 que el 2480) y se renumera
- `2477` trae el nº de agrupaciones restantes → `notifyCount`
- El servidor reenvía la lista completa, no hay "diff"
- `WarDetector` mantiene `activeWars[]` en memoria y actualiza por coordenadas + nombre
- Los protos 2477 y 2485 son notificaciones/confirmaciones que disparan re-consulta
- 7315 loguea el hex crudo (`[AGRU] 7315 raw`) además de parsearlo
