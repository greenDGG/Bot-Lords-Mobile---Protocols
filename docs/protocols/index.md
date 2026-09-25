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

- [`1201`](1201.md) — Lista de héroes del jugador (nivel, rango, grado)
- [`1401`](1401.md) — Inventario / items (respuesta del servidor)
- [`2002`](2002.md) — Construcciones / edificios (respuesta del servidor)
- [`2014`](2014.md) — Recursos (wheat, stone, wood, ore, gold) (respuesta del servidor)
- [`2037`](2037.md) — Estado del refinar maná (respuesta del servidor, contador diario 0..5)
- [`2038`](2037.md#vínculo-con-2038-refinar) — Refinar maná (comando cliente → servidor, ver `2037`)
- [`2402`](2402.md) — Entrenamiento de tropas (respuesta del servidor)
- [`3112`](3112.md) — Respuesta de datos (barco / misiones) — identificar por tamaño y questType
- [`3125`](3125.md) — Cofre VIP — estado (máscara de bits + timestamp) (servidor → cliente)
- [`3126`](3126.md) — Cofre VIP — reclamar ranura (cliente → servidor)
- [`3201`](3201.md) — Investigaciones / research (respuesta del servidor)
- [`4044`](4044.md) — Cofre del Tesoro Eterno (Everlasting Treasure) — lista de items para reclamar
- [`5201`](5201.md) — Coliseo — puesto, peleas (máx 5), gemas y rivales (estado del servidor)
- [`5204`](5204.md) — Coliseo — solicitar rivales (comando cliente → servidor)
- [`5205`](5205.md) — Coliseo — respuesta de rivales (servidor → cliente, header de 14 bytes)
- [`5208`](5208.md) — Coliseo — atacar rival (comando cliente → servidor, 36 bytes)
- [`5214`](5214.md) — Coliseo — reclamar gemas (comando cliente → servidor)
- [`1805`](1805.md) — Barrido / Sweep (comando cliente → servidor, 5 bytes)
- [`6302`](6302.md) — Barco de carga / Cargo Ship (respuesta del servidor, estado del barco)
- [`6305`](6305.md) — Intercambiar slot del barco (comando cliente → servidor)

## Solicitudes de datos (cliente → servidor)

- [`3111`](3111.md) — Solicitar datos: `01` = barco, `02` = misiones admin/guild

## Perfil de jugador

- [`1109`](1109.md) — Buscar perfil por nombre (C→S, 13 bytes: nombre null-padded)
- [`1110`](1110.md) — Respuesta de perfil (S→C, no decodificado completamente)

## Mapa

- [`2201`](2201.md) — Solicitar datos del mapa (C→S, 45 bytes: count + celdas u16 LE)
- [`2202`](2202.md) — Consultar información de tile (C→S, 3 bytes coord — necesario antes de cada 2452)
- [`2204`](2204.md) — Buscar jugador por nombre (C→S, 13 bytes: nombre null-padded)
- [`2205`](2205.md) — Respuesta ubicación de jugador (S→C, 4 bytes: status + coord)
- [`2220`](2220.md) — Datos del mapa (S→C, header 25B + tiles de 51B cada uno)

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
- [`2476`](2476.md) — Abrir pantalla de agrupaciones (C→S, payload vacío)
- [`2477`](2477.md) — Notificación inicio/fin de agrupación (S→C, 1 byte: 01=inicio, 00=fin)
- [`2478`](2478.md) — Lista de agrupaciones activas (S→C, ~58B por entrada: timestamp, coord, rallyType, names)
- [`2483`](2483.md) — Participantes de una agrupación (S→C, nombre + mask + tropas por participante)
- [`2485`](2485.md) — Notificación de actualización (S→C)
- [`6611`](7315.md) — Guerras a torres (S→C)
- [`7315`](7315.md) — Guerras a fortalezas (S→C)

## Ataque / Batalla

- [`3418`](3418.md) — Paquete de ataque/batalla (S→C, 377 bytes: stats de batalla, tropas, niveles)

## Gremio

- [`2802`](2802.md) — Información del gremio propio (S→C, tag 3B + nombre + título/descripción)
- [`2825`](2825.md) — Solicitar solicitudes de unión al gremio (C→S, 4 bytes, solo header)
- [`2813`](2813.md) — Aceptar/rechazar solicitud de unión al gremio (C→S, 13 bytes: `01`=aceptar, `02`=rechazar)
- [`2826`](2826.md) — Respuesta: lista de solicitudes de unión al gremio (S→C, 43 bytes por usuario)
- [`2859`](2859.md) — Notificación de solicitud de unión al gremio (S→C, 6 bytes: `0a00`=aceptada, `0a01`=llegada/pendiente, `0a02`=rechazada/cancelada)

## Atalaya / Marchas entrantes

- [`2440`](../investigacion/marchas.md) — Marcha entrante: detección inicial (S→C)
- [`2442`](2442.md) — Marcha entrante: actualización de tiempo restante (S→C)
- [`2441`](../investigacion/marchas.md) — Batalla inminente (S→C)
- [`2445`](../investigacion/marchas.md) — Solicitud de datos de marcha (C→S)
- [`2446`](../investigacion/marchas.md) — Datos de marcha: tropas, héroes (S→C)
