# Acelerar la marcha propia a una agrupación cuando llega tarde

> Resumen de la feature y de todo lo aprendido sobre los protocolos que usa
> (`1144`, `1406`, `1407`, `2414`, `2473`). Los detalles de wire están en
> [`../protocols/1144.md`](../protocols/1144.md),
> [`../protocols/1406.md`](../protocols/1406.md) y
> [`../protocols/1407.md`](../protocols/1407.md).

## 1. Qué hay que hacer

Al enviar tropas a una agrupación (rally) el `2473` devuelve
`startTs + durationSec` = hora de llegada de nuestra marcha. Si eso pasa del
cierre de la agrupación (`timeRemainingSec` del `7315`), la marcha llega
**tarde** y hay que acelerarla con un item de la mochila.

Decisiones tomadas (del usuario):

| Punto | Decisión |
|-------|----------|
| Disparo | **Automático**: si `gapSec > 5` (`WAR_ACCEL_MIN_GAP_SEC`) al confirmar el 2473 |
| Campo del índice | **Primero `fieldA`** (el primer u16, "02 en mi captura") y si falla, rotar |
| Ítem | **Automático**: el más pequeño de los genéricos que cubra el hueco, 1 unidad por intento (hasta el total que se tiene) |
| UI | Sin botón; todo por log (`[ACEL]`) + evento `warStatus` |

## 2. Lo que manda el cliente real (captura PacketLogger)

`docs/teories/marchs.md:64-137` — tres aceleraciones del cliente real, con su
`1144` 20 s antes y su `1406` justo después:

| Hora | 1144 acción 6 | 1406 | 2483 ~0.4 s después |
|------|---------------|------|---------------------|
| 13:43:08 → 13:43:24 | `0600 6400 0100` | `0f04 0100 6400 0100 …` | `01000000 "I Love Ado"` |
| 13:45:27 → 13:45:28 | `0600 6400 0200` | `0f04 0100 6400 0200 …` | `02000000 "Odo Frenzy"` |
| 13:55:38 | `0600 6400 0100` | — | — |

(`0f04` = item 1039 *Botas aladas I*, `quantity=1`, `6400` = 100, `0100`/`0200`
= 1/2.)

### Hipótesis de los dos `u16` (A y B)

- **`fieldB`** cambia 1 → 2 → 1 y coincide con el `u32` inicial del `2483`
  (índice de participante en la agrupación, `march-manager.ts:41`):
  probablemente es **el índice del objetivo** (participante/fila).
  En la captura de otro jugador salió `B=0` con `A=2`.
- **`fieldA`** se mantuvo en `100` toda la sesión (imposible como fila de
  marchas: el límite del 2414 es 6) — sin determinar.
- El escudo y los cofres mandan `A=B=0` (no hay marcha de por medio).

> Decisión: probar `fieldA` primero (lo que pidió el usuario) y **rotar** si el
> `1407` no acorta esta marcha; el cursor aprende el combo que funcionó.

## 3. Cadenas de paquetes

```
C→S  1144  [04] UI "Estado de ejército"     → una sola vez (si uiSection ≠ 04)
                                               sin espera: el 2414 sólo llega
                                               al iniciar el bot
C→S  1144  [06][A][B]  UI "speedup"+índice  → 20 s antes en el cliente real
C→S  1406  [itemId][qty][A][B][8×00]        → usar el item
S→C  1407  status + itemId + qtyLeft + ts   → nueva llegada
S→C  2483  (opcional) participantes         → índice = B
```

El servidor **no responde** al 1144 (tras él sólo llegan heartbeats) y tampoco
empuja un `2414` después de nuestra petición: verificado en vivo, el único
`2414` llega al iniciar el bot. Por eso **no se espera** ningún `2414` y la
lista propia se arma con la caché del 2414 + las marchas que el propio bot ha
enviado (§6).

**Rate limit**: si mandamos `1144`+`1406` muy seguidos, el servidor contesta
`1407` con `status=68` (`Len=1028`, sin `ts`) y **no aplica** el item. Por eso
entre intentos hay `ACCEL_RETRY_DELAY_MS = 2000` (§6). La UI actual se guarda
en `bot.uiSection` (`0x04` Estado de ejército → `0x06` speedup).

## 4. Qué está implementado

| Etapa | Archivo | Qué hace |
|-------|---------|----------|
| Fase 1 | `parsers/war-march.parser.ts` → `parse2473` | inicio + duración + líder desde el 2473 |
| Fase 1 | `core/bot-instance.ts` → `processWarSendConfirm` | compara llegada vs. cierre, guarda `bot.warMarch.gapSec` |
| Fase 2 | `parsers/speedup.parser.ts` → `parse1407` | layouts corto (`ts@7`) / largo (`ts@11`), `qtyLeft` u16@3 |
| Fase 2 | `commands/speedup.commands.ts` | `sendArmyStatus`, `sendSpeedupSelect`, `sendSpeedupUse`, `pickSpeedupItem`, `resolveAccelIndex`, `resolveParticipantIndex`, `ACCEL_CANDIDATES` |
| Fase 2 | `engine/bot-engine.ts` | `resolveReply` para `1407` y `2414` |
| Fase 2 | `core/bot-instance.ts` → `runWarAccelerate` | bucle completo (ver §6) |

### Selección del ítem (`pickSpeedupItem`)

Orden de prioridad: **1) Botas de dragón (1405)** si hay en la mochila y
`remainingSec > 0` → **2) aceleradores genéricos** → **3) resto de botas**
(1039/1121/1122 aladas). Las botas de dragón son del **evento arena dragón**:
si están en la mochila hay que gastarlas, así que mandan incluso cuando queda
algún genérico.

1. Sólo `GENERIC_SPEEDUP_IDS` = 1029 (60 s), 1148 (180), 1144 (300), 1149
   (600), 1040 (900), 1041 (1800), 1042 (3600), 1081 (10800), 1082 (28800),
   1083 (54000), 1084 (86400), 1085 (259200), 1086 (604800), 1087 (2592000) —
   todos `type=acelerar` con `effect=[1,segundos]` en `items.json`.
2. Se descartan los de investigación/curación/entrenamiento/reparación/fusión
   (1257-1268, 1276-1286, 1318+, …), los de energía (1162-1167) y el martillo
   de oro (1092, sin `effect`).
3. Se elige el más pequeño que cubra `gapSec`; si no existe, el mayor, y
   `qty = min(ceil(gap/segundos), cantidad en mochila)`.
4. **Botas (respaldo)**, en este orden (`MARCH_BOOTS_IDS`):
   **1405 *Botas de dragón* (evento arena dragón) → 1039 *Botas aladas I* →
   1121 *II* → 1122 *III***. La 1405 se intenta **antes** que los genéricos
   (paso 1); las aladas sólo cuando no queda ningún genérico. Se usa
   **1 bota** con `seconds = floor(0.25 × tiempo restante de la marcha)` — 25 % es un
   **estimado conservador** (el `effect` real no está en `items.json`): si la
   bota ahorra menos, el bucle simplemente sigue; si ahorra más, mejor. Sólo
   se entran si `remainingSec > 0`. El inventario de referencia del cliente
   trae 136× I, así que este camino es el habitual en cuentas reales.
5. El inventario sale del `1401`, que llega **en varias páginas** (cabecera de
   3 B = `[u8 page][u16 count LE]`, `count` registros de 4 B):
   `handleInventory` limpia sólo en `page === 1` y valida
   `3 + count × 4 === body.length` (antes un guard `body.length <= 500`
   descartaba la página 2 y las botas/pequeños aceleradores no aparecían).

### Índices (`ACCEL_CANDIDATES`, 5 combos, `MAX_ACCEL_ATTEMPTS = 5`)

**Regla del jugador** (la que manda): el servidor no nos da un índice, nosotros
lo calculamos — *«si envías 2, la que menos tiempo tenga es el `index` 0»* →
lista propia ordenada por **tiempo restante ascendente** y nuestro índice es la
posición. Por eso `sorted` es el candidato 1.

| # | campo | origen del índice |
|---|-------|-------------------|
| 1 | `a` | posición en la lista propia ordenada por tiempo restante (`sorted`) |
| 2 | `b` | posición `sorted` |
| 3 | `b` | **índice de participante** en el `2483` (máscara + tropas del último 2472) |
| 4 | `a` | `index` real de la entrada en el 2414 (`slot`) |
| 5 | `b` | `slot` |

La lista propia (`accelMarchList`) = entradas del `2414` en caché (incluidas las
que ya llegaron, que son las de 0 s restantes y por eso van a la posición 0) +
las marchas enviadas por el propio bot (`ownSentMarches`, sintéticas y con
dedupe por `startAt`), para no depender del `2414`.

`accelCursor` (campo de la instancia) **persiste el combo que funcionó** y se
detiene al volver al `startCursor` de la ronda.

## 5. Verificación (lo importante)

Tras cada `1406` se espera el `1407` (5 s) y sólo se da por buena la
aceleración si:

1. hay body y `parse1407(body).ok`;
2. `status === 0`;
3. **`r.arrivalTs < warMarch.arrivalTs − 3`** (la llegada de *esta* marcha
   bajó de verdad).

Si no, depende del caso:

- **sin `1407` o `status ≠ 0`** (p. ej. `status=68` con `Len=1028`, lo observado
  en vivo) → **rate limit**: se **repite el mismo candidato** tras
  `ACCEL_RETRY_DELAY_MS` (2 s), hasta `ACCEL_STATUS_RETRIES = 3`; sólo entonces
  se rota.
- `status === 0` pero la llegada no bajó → el campo/índice no apuntaba a *esta*
  marcha: se rota al siguiente candidato.

Si cambió la llegada pero de otra
marcha, el item se perdió: por eso se manda **1 unidad** por intento.

Cuando aplica: se descuenta el inventario + `emit('inventoryUpdated')`, se
actualiza `warMarch` (`startTs`/`durationSec`/`arrivalTs`/`gapSec`) y la
entrada del `ownMarches` + `emit('ownMarchesUpdated')`; si aún queda hueco, el
mismo bucle repite con otro item.

## 6. Orden de ejecución real (`runWarAccelerate`)

```
1. 1144 UI 0x04 (Estado de ejército) sólo si bot.uiSection ≠ 0x04
   — sin espera de 2414; marca uiSection = 0x04
2. entries = accelMarchList(ahora) = caché 2414 + ownSentMarches
   target  = findOwnWarMarchEntry(entries): |startAt − warMarch.startTs| ≤ 15 s
             y durationSec igual
3. bucle mientras gapSec > 0 y fallos < 5 y aplicadas < 5:
      sleep(ACCEL_RETRY_DELAY_MS) si no es el primer intento  ← rate limit
      pickSpeedupItem(gap, tiempo restante de la marcha)
                           ← dragón 1405 → genéricos → aladas
      index según el candidato (recomputando entries/target en cada vuelta)
      1144 UI 0x06 speedup (campo, index) → uiSection = 0x06 → sleep 350 ms
      waitForReply(1407, 5000) + 1406 (item, qty, campo, index)
      validar arrivalTs → aplicar o rotar
4. informar: "listo" / "quedan Ns"
```

`processWarSendConfirm` empuja la marcha recién enviada en `ownSentMarches`
(dedupe por `startAt`, purga a los 10 min de llegar), así que el `target` se
encuentra aunque el `2414` haya llegado al arrancar y esté viejo.

Todo corre encolado en `bot.enqueueCommand` (mismo carril que el resto de
comandos) y con `accelRunning` para no solapar aceleraciones.

## 7. Cómo probarlo / qué mirar en los logs

```powershell
npx tsc --noEmit                                  # backend/
npx ts-node scripts/test-accel-march.ts           # checks: parseo, payloads, picks, índices, 1401
npx ts-node scripts/test-2473.ts                  # Fase 1 sigue OK
```

En vivo, grep de una sola pasada (ojo: los logs tienen decenas de miles de
líneas, usar `-Last N` o un patrón fino):

```
Select-String -Path logs\<cuenta>.log -Pattern '\[ACEL\]|proto=1144 seq=|proto=1406 seq=|Proto=1407'
```

Esperado en el mejor caso (candidato 1 acierta):

```
[ACEL] campo a · índice N (sorted) · 1× item 1149 (600s) para 512s
[ACEL] acelerada 512s (quedan 0× del item 1149) → llega HH:MM:SS, falta -3s
```

## 8. Pendientes

1. **Confirmar en vivo el layout del 1407 de un acelerador genérico** (sólo hay
   muestras de escudo `Len=153`, botas y cofre `Len=53`).
2. Qué es `fieldA` (100 / 2 / 0) y si el servidor exige que `fieldA` **y**
   `fieldB` vayan los dos rellenos — el cliente real manda los dos, el bot
   sólo uno por intento.
3. `fieldA`/`fieldB` como `index` de la agrupación (no implementado; los
   combos actuales cubren fila 2414 y participante 2483).
4. **Porcentaje real de las botas de combate** (1405 *Botas de dragón*,
   1039/1121/1122 *Botas aladas*): no hay `effect` en `items.json` y se asume
   `0.25 × tiempo restante` (`BOOTS_FRACTION`). Falta medirlo en vivo: el
   `1407` de las botas sólo devuelve el nuevo tiempo de la marcha
   (`newTimeSec=384`), no el % aplicado.
5. El byte de índice del `2414` (las muestras dan `01` con 1 marcha y `00` con
   3) **no se usa**: el bot calcula la posición por tiempo restante (regla
   «la de menos tiempo = 0»). Si en vivo el servidor esperara ese byte, hay que
   cambiarlo; hasta ahora el fallo fue por falta de 2414 y de items, no por el
   índice.
6. `u16 extra16@7` / `u32 extra32@23` del 1407 largo y la basura (punteros)
   que trae a partir de ~offset 27.
