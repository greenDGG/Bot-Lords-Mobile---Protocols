# API WebSocket (Socket.IO)

El frontend se comunica con el backend vía Socket.IO en `http://localhost:3000` (el dev server de Vite hace proxy de `/socket.io`).

## Eventos cliente → servidor

| Evento | Payload | Descripción |
|--------|---------|-------------|
| `listAccounts` | — | Pide la lista de cuentas. Respuesta: `accounts` |
| `getItems` | — | Pide `data/items.json`. Respuesta: `items` |
| `getRunningBots` | — | Estado de los bots corriendo. Respuesta: `runningBots` |
| `createAccount` | `{ iggId, accessToken, proxy? }` | Crea cuenta en MongoDB (requiere DB). Respuesta: `accountCreated` |
| `startBot` | `{ iggId }` | Inicia el bot de una cuenta. Respuesta: `botStarted` / `connectionFailed` / `error` (con `iggId` si la cuenta ya está iniciada o iniciando) |
| `stopBot` | `{ iggId }` | Detiene el bot. Respuesta: `botStopped` |
| `getBotData` | `{ iggId }` | Snapshot completo de una cuenta. Respuesta: `botData` (incluye `familiars` + `familiarCooldowns` / `familiarFatigue` / `familiarBuffs`, y `dailyMissions` del Diario) |
| `sendCommand` | `{ iggId, command }` | Comando de texto: `help`/`ayuda`, `chat <texto>`, `disconnect`/`desconectar`, `shield`/`escudo` |
| `requestMapData` | `{ iggId }` | Solicita datos del mapa (2227) |
| `requestWarData` | `{ iggId }` | Abre la ventana de guerra y pide datos (2476) |
| `setWarViewing` | `{ iggId, viewing }` | Activa/desactiva la vista de guerra (notificaciones vs. refresco) |
| `buyFruit` | `{ iggId }` | Compra fruta de reanimación (1408) |
| `useFruit` | `{ iggId }` | Usa fruta de reanimación (1406) |
| `useFamiliarSkill` | `{ iggId, petId, skillId, force? }` | Usa una skill activa de un monstruito (8226). Chequea el cooldown del 8231 (`availableAt <= serverNowSec()`) salvo `force`. Respuesta: `familiarSkillResult` |
| `openChest` | `{ iggId, itemId, quantity }` | Abre cofres en lotes de 100 (1406). Progreso: `chestProgress` |
| `globalCommand` | `{ proto, body }` | Envía un packet crudo (body hex) a **todas** las cuentas online. Respuesta: `globalCommandResult` |
| `sendWarTroops` | `{ iggId, warIndex, enemyName, tier, infantry, artillery, cavalry, infantryCount, artilleryCount, cavalryCount }` | Envía tropas a una guerra (2476 → 1144 → 2472). Progreso: `warStatus` |
| `saveConfig` | `{ iggId, config }` | Guarda config (deep merge + MongoDB upsert). Respuesta: `configUpdated` |
| `importCapture` | `{ json }` | Importa una captura de mitmproxy (token+proxy) a MongoDB. Respuesta: `accountCaptured` / `captureError` |

## Eventos servidor → cliente

| Evento | Payload | Descripción |
|--------|---------|-------------|
| `accounts` | `[{ iggId, token, config }]` | Lista de cuentas (files + MongoDB) |
| `items` | `ITEMS_DB` | Items de `data/items.json` |
| `runningBots` | `{ running, players, shields, resources, inventory, treasureChamber, buildingState }` | Estado global |
| `botStarted` / `botStopped` | `{ iggId }` | Ciclo de vida |
| `connectionFailed` | `{ iggId, message? }` | Falla de conexión |
| `ready` | `{ iggId }` | Bot listo tras la secuencia de init |
| `log` | `{ iggId, msg }` | Log en tiempo real |
| `statusChanged` | `{ iggId, online }` | Estado online/offline |
| `playerInfo` / `resources` / `guildInfo` / `troopTraining` / `inventory` / `buildingState` / `constructions` / `essence` / `troops` / `hospitalState` / `incomingMarches` / `leaderState` / `shield` / `mapDataUpdated` | `{ iggId, ... }` | Actualizaciones de estado parcial |
| `wars` | `{ iggId, wars }` | Guerras activas |
| `warNotification` | `{ iggId, count }` | Notificación de guerra pendiente |
| `questsUpdated` | `{ iggId }` | Misiones actualizadas |
| `dailyMissions` | `{ iggId, dailyMissions: { pa, chestMask, missionRank, maxPa, chests[], missions[{ id, value, requirement, energy, desc, hint, param, state }] } \| null }` | Estado del Diario (3144/3143); `state` = `claimed` \| `complete` \| `progress`. Push en `dailyMissionsUpdated`; también en `botData.dailyMissions` |
| `artifacts` | `{ iggId, artifacts: { list, sets }, playerStats }` | Artefactos poseídos (vistas con efectos × estrella + tiers de los sets); push en `artifactsUpdated` (login 9771 y cambios) |
| `familiars` | `{ iggId, list, playerStats, cooldowns, fatigue, buffs }` | Monstruitos; `cooldowns: [{ skillId, availableAt }]` (epoch s), `fatigue: { fatigue, max, resetAt }`, `buffs: [{ skillId, level, startTs, durationSec }]`; push en `familiarsUpdated` (8210/8245/8231/8230/8232) |
| `familiarSkillResult` | `{ iggId, petId, skillId, sent, reason?, availableAt?, remainingSec? }` | Resultado de `useFamiliarSkill`; `sent:false, reason:'cooldown'` si aún no está lista |
| `chestProgress` | `{ iggId, opened, total, done }` | Progreso de apertura de cofres |
| `warStatus` | `{ iggId, status }` | Progreso del envío de tropas |
| `accountCaptured` | `{ iggId }` | Captura importada correctamente |
| `captureError` | `{ message }` | Error importando captura |
| `error` | `{ iggId?, message }` | Error genérico (`iggId` cuando es relativo a una cuenta) |
| `configUpdated` | `{ iggId, config }` | Config guardada |
| `globalCommandResult` | `{ sent, proto }` | Resultado del comando global |

## Middleware HTTP del dev server (captura MITM)

`frontend/vite.config.ts` agrega endpoints HTTP en el dev server de Vite:

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/api/capture/start` | POST | Lanza `mitmproxy --mode local -s capture_account.py` en ventana propia + watcher de `capture_*.json` |
| `/api/capture/stop` | POST | Detiene mitmproxy y el watcher |
| `/api/capture/status` | GET | `{ capturing }` |

La captura genera `capture_{iggid}.json` en el directorio de trabajo del frontend; el watcher lo lee y lo envía al backend con `importCapture`.
