# Configuración del bot (`BotConfig`)

La configuración de cada cuenta se guarda en `access/{iggId}/config.json` y en MongoDB (colección `Config`). Se normaliza a camelCase al leerla. Tipo en `backend/src/models/bot-config.ts`.

## Campos

| Campo | Tipo | Default | Descripción |
|-------|------|---------|-------------|
| `dailyResetTime` | string | `'00:00'` | Hora UTC del reset diario (para daily/forge gift) |
| `limitTrain` | number | `0` | Cantidad de tropas a entrenar por ciclo (0 = no entrenar) |
| `reconnectTime` | number | `30` | Segundos de espera antes de reconectar (mín 5) |
| `sendHelp` | boolean | `true` | Enviar ayuda automática (proto 2855) |
| `proxy` | string | `''` | Dirección del proxy IGG `ip:port` |
| `warMode` | boolean | `false` | Modo guerra: aplica contra-formaciones a marchas entrantes |
| `train` | object | — | Ver abajo |
| `shield` | object | — | Ver abajo |
| `giftDaily` | object | — | Ver abajo |
| `mysteryBox` | object | — | Ver abajo |
| `ship` | object | — | Ver abajo |
| `forgeGift` | object | — | Ver abajo |
| `chestVip` | object | — | Ver abajo |
| `artifactFair` | object | — | Ver abajo |
| `refineMana` | object | — | Ver abajo |
| `openGuildChest` | object | — | Ver abajo |
| `adminQuest` | object | — | Misiones de administrador |
| `guildQuest` | object | — | Misiones de gremio |
| `resourceLimit` | object | — | Límite de almacén por recurso |
| `supply` | object | — | Envío de recursos por caravana |

## Sub-configuraciones

### `train`
```json
{ "enable": false, "type": "40", "velTrain": 0, "subsidiosPorcentaje": 0 }
```
- `type`: 2 dígitos — primero tipo (0=inf, 1=art, 2=cab, 3=asedio), segundo tier (0-3 = T1-T4)
- `velTrain`: nivel de velocidad de entrenamiento (para calcular tiempo)
- `subsidiosPorcentaje`: % de subsidio (ver [`investigacion/subsidios.md`](investigacion/subsidios.md))

### `shield`
```json
{ "enable": true, "type": "1d", "redeployTime": "1h" }
```
- Compra escudo 24h (1000 gemas) y lo reactiva cuando faltan menos de `redeployTime`.
- `redeployTime` soporta `h`, `m`, `s` (ej: `"30m"`, `"1h30m"`).

### `giftDaily`
```json
{ "autoreclaim": true, "next": 0, "index": 0 }
```
- Reclama el regalo diario (proto 3605 + 3130). `index` rota 0-20, `next` = próxima hora de reset.

### `mysteryBox`
```json
{ "enable": true, "next": 0 }
```
- Abre la caja misteriosa (1117) cuando `next` expira. El servidor avisa el próximo timestamp vía proto 1118.

### `ship`
```json
{ "intercambio": true, "next": 0, "reclaim": true }
```
- Barco de carga (ver [`guides/cargo-ship.md`](guides/cargo-ship.md)). Ciclo de 8h.

### `forgeGift`
```json
{ "enable": true, "next": 0 }
```
- Reclama el regalo de la forja (9903) una vez al día.

### `chestVip`
```json
{ "enable": true }
```
- Reclama el cofre VIP (3126) según la máscara/nextClaim de `vipChestMem` (proto 3125).

### `artifactFair`
```json
{ "enable": false, "reset": 0 }
```
- Cofre gratis de la feria de artefactos (ver [`investigacion/cofre-artefactos.md`](investigacion/cofre-artefactos.md)). Reset diario 02:00 UTC.

### `refineMana`
```json
{ "enable": false }
```
- Refina maná (2038) mientras el estado del servidor (proto 2037) indique menos de 5 reclamados (máx diario). El reset lo maneja el propio juego.

### `openGuildChest`
```json
{ "enable": false }
```
- Abre cofre de gremio (2868 + 2870).

### `adminQuest` / `guildQuest`
```json
{ "enable": true }
```
- Reclama misiones completadas (3117) de admin/guild.

### `resourceLimit`
```json
{ "wheat": 1000000000, "wood": 1000000000, "stone": 1000000000, "ore": 1000000000, "gold": 1000000000 }
```
- Tope del `ResourceTracker` (producción simulada).

### `supply`
```json
{ "enable": false, "location": "db00af", "threshold": 7000000, "caravanLimit": 4 }
```
- Envía caravanas (2452) con recursos que superen `threshold` hasta una ubicación (`location` = 3 bytes hex de coordenadas).
- `caravanLimit`: máximo de caravanas simultáneas.
- La cantidad por caravana **no es config**: sale del stat `Capacidad de
  suministro +` de cada cuenta (Puesto Comercial + "Bolsas más grandes", con el
  % si lo hay) → `getSupplyCapacity()` en `backend/src/bot/features/player-stats.ts`.
- Migración: `npm run migrate:supply` borra el `maxAmount` viejo de Mongo y de
  `access/<iggId>/config.json` (al cargar, `pickSupply`/`stripLegacyConfig` lo
  descartan igual, así que una config sin migrar no rompe nada).
- Al recibir 2455 (lote completado) reanuda.

## Persistencia

- Al iniciar, se lee `config.json` (o MongoDB si no hay file) y se fusiona con los defaults (`mergeConfig`).
- `saveConfig()` escribe solo los campos temporales (next, index, reclaim, reset) preservando el resto del archivo original.
- La UI guarda el config completo vía evento `saveConfig` (deep merge + upsert en MongoDB).
