# Protocolos documentados

> Guías: [`Barco de Carga`](../guides/cargo-ship.md)

## Conceptos generales

- [`seq`](seq.md) — Sequence number: qué es, cómo funciona, para qué sirve

## Secuencia de init (conexión)

| # | Proto | Nombre | Wire | Cifrado |
|---|-------|--------|------|---------|
| 1 | [`1020`](1020.md) | MSG_REQUEST_CLIENTINITOVER | 0x03FC | DES |
| 2 | [`1416`](1416.md) | MSG_REQUEST_LOADEQUIP | 0x0588 | DES |
| 3 | [`1414`](1414.md) | MSG_REQUEST_ITEMMAT | 0x0586 | DES |
| 4 | [`1418`](1418.md) | MSG_REQUEST_ITEMGEM | 0x058A | DES |
| 5 | [`3002`](3002.md) | MSG_REQUEST_VIEWCHAT | 0x0BBA | Plano |
| 5b | [`3003`](3003.md) | MSG_CHAT (chat entrante) | 0x0BBB | Plano |
| 6 | [`3405`](3405.md) | MSG_REQUEST_NOTICEINFO | - | DES |
| 7 | [`11155`](11155.md) | MSG_REQUEST_ACTIVITY_EVENT_ITEM_SHOP_INFO | - | Plano |
| 8-9 | [`9721`](9721.md) | — | 0x3C19 / 0x0FA2 | Plano |
| 10 | [`4004`](4004.md) | MSG_REQUEST_TREASURE_COMBOBOX | 0x0FA4 | Plano |

## Paquetes del servidor (respuestas / notificaciones)

- [`1008`](1008.md) — Info del rol en el login (705 B): jugador, poder, energía y fecha de creación (offset 210 = reset diario de la cuenta)
- [`1201`](1201.md) — Lista de héroes del jugador (nivel, rango, grado)
- [`1401`](1401.md) — Inventario / items (respuesta del servidor)
- [`2002`](2002.md) — Construcciones / edificios (respuesta del servidor)
- [`2014`](2014.md) — Recursos (wheat, stone, wood, ore, gold) (respuesta del servidor)
- [`2037`](2037.md) — Estado del refinar maná (respuesta del servidor, contador diario 0..5)
- [`2038`](2037.md#vínculo-con-2038-refinar) — Refinar maná (comando cliente → servidor, ver `2037`)
- [`2402`](2402.md) — Entrenamiento de tropas (respuesta del servidor)
- [`2414`](2414.md) — Lista de marchas propias del castillo (S→C, sin request: límite + entries de 150 B con slot, estado, coord destino, nombre, ts y duración)
- [`3112`](3112.md) — Respuesta de datos (barco / misiones) — identificar por tamaño y questType
- [`3125`](3125.md) — Cofre VIP — estado (máscara + timestamp) o rechazo de reclamo (servidor → cliente)
- [`3126`](3126.md) — Cofre VIP — reclamar ranura (cliente → servidor)
- [`3201`](3201.md) — Investigaciones / research (respuesta del servidor: cabecera 15 B con techId activa + nivel + timestamp + restantes, y cola de 250 B con el nivel de las 500 techs en nibbles)
- [`3208`](3208.md) — Investigación completada (evento: u16 TechID + u8 nivel, 3 bytes)
- [`3801`](3801.md) — Talentos del jugador (push de login: u16 puntos sin asignar + 47 u8 con el nivel de cada talento, 102 bytes)
- [`4044`](4044.md) — Cofre del Tesoro Eterno (Everlasting Treasure) — lista de items para reclamar
- [`5201`](5201.md) — Coliseo — puesto, peleas (máx 5), gemas y rivales (estado del servidor)
- [`5204`](5204.md) — Coliseo — solicitar rivales (comando cliente → servidor)
- [`5205`](5205.md) — Coliseo — respuesta de rivales (servidor → cliente, header de 14 bytes)
- [`5208`](5208.md) — Coliseo — atacar rival (comando cliente → servidor, 36 bytes)
- [`5214`](5214.md) — Coliseo — reclamar gemas (comando cliente → servidor)
- [`1805`](1805.md) — Barrido / Sweep (comando cliente → servidor, 5 bytes)
- [`6302`](6302.md) — Barco de carga / Cargo Ship (respuesta del servidor, estado del barco)
- [`6305`](6305.md) — Intercambiar slot del barco (comando cliente → servidor)
- [`8210`](8210.md) — Lista de monstruitos (S→C, sin request: tag + u16 count + registros de 28 B con petId, nivel, exp, etapa y nivel/exp de sus 4 habilidades)
- [`8231`](8231.md) — Cooldown de habilidades activas de monstruitos (S→C: `u8 count` + entries de 10 B con skillId y `availableAt` epoch; `availableAt = últimoUso + CD[nivel]` con CD de `PetSkillCD.txt` en **minutos**)
- `8230` — Fatiga de skills ofensivas (S→C, 12 B: `u16 fatigue`, `u16 max=45`, `u32 epoch`, `u32 0`; solo relevante para skills subj=2)
- `8232` — Buffs activos de monstruitos (S→C: 12 B de cabecera + `u8 count` + entries de 15 B con skillId, nivel, inicio, duración)
- `8244` — Estado de skill (S→C, 10400 capturas, 5 B: `u16` + `u16` + `u8`; semántica pendiente)
- [`8245`](8245.md) — Talentos de ejército desbloqueados (S→C, sin request: u16 count + pares {u16 petId, u8 nivel 1..10})
- [`9771`](9771.md) — Lista de artefactos poseídos (S→C, sin request: u16 count + registros de 4 B con u16 artifactId 7001..7250, u8 nivel 1..12 y u8 estrellas 0..6 — 6 = Bendecido)
- [`1111`](1111.md) — Buffs activos del jugador (S→C, sin request: `u8 count` + entries de 16 B con buffId, itemId, inicio y duración; snapshot completo, periódico ~37 s)

## Solicitudes de datos (cliente → servidor)

- [`3111`](3111.md) — Solicitar datos: `01` = barco, `02` = misiones admin/guild
- [`8226`](8226.md) — Usar habilidad activa de monstruito (C→S: `u32 seq` + coord del castillo emisor 3 B (`encodeCoord`) + `u16 petId` + `u16 skillId`; sin la coord el server rechaza con `8227 result=6`)
- `8227` — Respuesta del uso de skill (S→C, 17 B: `u8 result` — 0 = usada con el `availableAt` nuevo, 6 = rechazada — + eco de petId/skillId)

## Perfil de jugador

- [`1109`](1109.md) — Buscar perfil por nombre (C→S, 13 bytes: nombre null-padded)
- [`1110`](1110.md) — Respuesta de perfil (S→C, no decodificado completamente)

## Mapa

- [`2201`](2201.md) — Solicitar datos del mapa (C→S, 45 bytes: count + celdas u16 LE)
- [`2202`](2202.md) — Consultar información de tile (C→S, 3 bytes coord — necesario antes de cada 2452; responde `2220` de 60 B con `NOT`/`YES`)
- [`2204`](2204.md) — Buscar jugador por nombre (C→S, 13 bytes: nombre null-padded)
- [`2205`](2205.md) — Respuesta ubicación de jugador (S→C, 4 bytes: status + coord)
- [`2220`](2220.md) — Datos del mapa (S→C, header 25B + tiles de 51B cada uno), variante march de 73B (marcha en curso), monster hit de 104B, ocupación de tile de 48B (quién recolecta un tile de recurso + cantidad restante) y aceleramiento de 31B (record `0x12`: nueva llegada = RECV + `f1`, cruzado contra la marcha por el bloque de 6B)

## Carta de la Suerte (cofres especie 217)

Flujo: `2202` (¿reclamado?) → `9866` (mandar tropa) → `9867` (ack) → `9862`
(carta recibida). Con tres nueves en mano se canjea con `9864` → `9865` y el bot
deja de buscar en ese evento: el estado se guarda en la DB
(`LuckyExchangeClaim`, una fila por cuenta y por evento). El evento arranca en
`eventTs` y dura `duration` segundos (172740 ≈ 2 días); al pasar esa fecha el
bot no vuelve a buscar.

| Proto | Wire | Dir | Resumen |
|-------|------|-----|---------|
| [`9861`](9861.md) | `0x2685` | S→C | Estado del evento (41 B): cartas en mano, inicio y duración del evento, especie 217 — login y cambios de estado |
| [`9862`](9862.md) | `0x2686` | S→C | Carta recibida (2 B: dígito + flag — `01` = entró al top 10, `00` = no entró) |
| `9863` | `0x2687` | S→C | `LUCKYCARD_UNLOCK` — no observado |
| [`9864`](9864.md) | `0x2688` | C→S | Canjear dígitos (4 B: u32 LE con los 3 dígitos más altos) |
| [`9865`](9865.md) | `0x2689` | S→C | Respuesta del canje (10 B: status + eco + saldo de gems); **cualquier status cierra el evento en la DB** |
| [`9866`](9866.md) | `0x268A` | C→S | Mandar tropa a buscar la carta (3 B coord) |
| [`9867`](9867.md) | `0x268B` | S→C | Ack de la búsqueda (17 B: status + coord + duración) |
| [`9868`](9868.md) | `0x268C` | S→C | Estado de la marcha (15 B: `01` yendo / `02` terminada) |

Nota: el aviso de carta con la cola `88 01 00 00 00 <dígito>` llega por
**`3439` (`_MSG_RESP_NOTICEINFO`)**, no por el 9868 — ver
[9868 § dónde está el dígito](9868.md#dónde-está-realmente-el-dígito-3439-noticeinfo).

## Laberinto (evento)

Evento donde se golpea un monstruo por recursos (−100 estrellas por golpe);
al llegar a 10 golpes puede aparecer el gremblin, que da gemas. Tiros gratis
de la bendición divina: byte `[20]` del `7004`.

- [`7004`](7004.md) — Laberinto: estado del golpe / ronda (S→C, 22 B) + rechazos `65`/`67`
- `7001` — Abrir laberinto (C→S, 5 B: seq + `00`)
- `7002` — Respuesta del 7001 (S→C, 17 B, ver [`7004`](7004.md#7002-respuesta-del-7001))
- `7003` — Golpear (C→S, 5 B: seq + `01` normal / `00` élite)
- `7005` — Visto en captura (C→S, 4 B: sólo seq, sin identificar)

## Supply / Caravanas

- [`2452`](2452.md) — Enviar caravana de recursos (C→S, 23 bytes: coord + 5 recursos)
- [`2453`](2453.md) — Respuesta de caravana: ≥17B en marcha / <17B fallo (S→C)
- [`2455`](2455.md) — Lote de caravanas completado (S→C, sin payload)

## Cámara del Tesoro

- [`4201`](4201.md) — Estado de la inversión (nivel, gemas, duración) (respuesta del servidor)
- [`4202`](4202.md) — Invertir gemas (comando cliente → servidor)
- [`4206`](4206.md) — Reclamar inversión vencida (comando cliente → servidor)

## Keep-Alive / Sesión

- [`1010`](1010.md) — Desconexión por dispositivo duplicado (lo envía el servidor)
- Heartbeat: proto **1024** (`_MSG_REQUEST_ACTIVE`), se envía cada 15s — ver en [`connection-flow.md`](../connection-flow.md)

## Recompensas / Quests

- [`3610`](3610.md) — Recompensas por nivel (S→C, gemas + objetos por nivel + lista de items)

## Guerra / Agrupaciones

- [`2472`](2472.md) — Enviar tropas a agrupación (C→S, 13B nombre + mask + cantidades)
- [`2473`](2473.md) — Confirmación del 2472 (S→C, inicio + duración de la marcha propia y líder de la agrupación; `Len=5 body=03` = rechazo)
- [`2476`](2476.md) — Abrir pantalla de agrupaciones (C→S, payload vacío)
- [`2477`](2477.md) — Contadores de agrupación (S→C, 8B: u32[0]=propias del gremio 0..4, u32[1]=en contra del gremio 0..3)
- [`2478`](2478.md) — Lista de agrupaciones activas (S→C, ~58B por entrada: timestamp, coord, rallyType, names)
- [`2483`](2483.md) — Participantes de una agrupación (S→C, nombre + mask + tropas por participante)
- [`2485`](2485.md) — Notificación de actualización (S→C)
- [`6611`](6611.md) — Guerras a torres (S→C, **1 paquete = 1 torre**, 87B: lado + slot + timestamp + coord + líder + tropas)
- [`7315`](7315.md) — Guerras a fortalezas (S→C)

## Items / Aceleración de marchas

Flujo completo documentado en [`acelerar-marchas`](../teories/acelerar-marchas.md)
(cuándo dispara, qué campo es cada u16, cómo se elige el ítem y cómo se
verifica con el `1407`).

- [`1144`](1144.md) — Selección de sección/acción de UI (C→S, 6 B: `action` + `fieldA` + `fieldB`; acciones 02/03/05 personaje-formación-guerra, 0b agrupaciones, 06 destino del acelerador, 04 Army Status)
- [`1406`](1406.md) — Usar item (C→S, 14 B: `itemId` + `quantity` + `fieldA` + `fieldB` + 8 B ceros; cofres ×100, escudos, botas, aceleradores)
- [`1407`](1407.md) — Respuesta de "usar item" (S→C: `status` + `itemId` + `qtyLeft` u16 + eco de `fieldA`; con `ts` a offset 7 u 11 según layout → `arrival = ts + newTimeSec`)

## Ataque / Batalla

- [`3418`](3418.md) — Paquete de ataque/batalla (S→C, 377 bytes: stats de batalla, tropas, niveles)
- [`2488`](2488.md) — Cazar monstruo del mapa (C→S, 17 bytes: coord 3B + payload de config; un golpe = una energía)
- `2489`/`2490`/`2491`/`2492` — Respuestas de caza (S→C, cuerpos sin decodificar, se loguean en `hunt.handler.ts`)

## Chat

- [`3001`](3001.md) — Enviar mensaje de chat (C→S, canal 1B + `00` + `05` + len u16 + texto; variante `6D` = enviar emoticono con `[u16 emojiId][u16 idx]`)
- [`3002`](3002.md) — Abrir la vista de chat (init #5, plano)
- [`3003`](3003.md) — Chat entrante (S→C, lista de mensajes)

## Gremio

- [`2802`](2802.md) — Información del gremio propio (S→C, tag 3B + nombre + título/descripción)
- [`2825`](2825.md) — Solicitar solicitudes de unión al gremio (C→S, 4 bytes, solo header)
- [`2813`](2813.md) — Aceptar/rechazar solicitud de unión al gremio (C→S, 13 bytes: `01`=aceptar, `02`=rechazar)
- `2826` — Respuesta: lista de solicitudes de unión al gremio (S→C, 43 bytes por usuario)
- [`2859`](2859.md) — Notificación de solicitud de unión al gremio (S→C, 6 bytes: `0a00`=aceptada, `0a01`=llegada/pendiente, `0a02`=rechazada/cancelada)

## Atalaya / Marchas entrantes

- `2440` — Marcha entrante: detección inicial (S→C, sin doc propia)
- [`2442`](2442.md) — Marcha entrante: actualización de tiempo restante (S→C)
- `2441` — Batalla inminente (S→C, sin doc propia)
- `2445` — Solicitud de datos de marcha (C→S, sin doc propia)
- `2446` — Datos de marcha: tropas, héroes (S→C, sin doc propia)
