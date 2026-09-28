# Arquitectura del backend

Backend TypeScript (NestJS + Socket.IO) que conecta cuentas de Lords Mobile como bot: se autentica contra el proxy de IGG, se conecta al game server y ejecuta acciones automáticas.

## Vista general

```
┌─────────────────────────────────────────────────────────────┐
│ Frontend (Vite + React)                                       │
│  - Dashboard de cuentas (listAccounts)                       │
│  - Logs en tiempo real, estado, mapa, guerra                  │
│  - Inicia MITM capture (vite.config.ts → mitmproxy)           │
└──────────────────────────────┬──────────────────────────────┘
                               │ Socket.IO (http://localhost:3000)
┌──────────────────────────────▼──────────────────────────────┐
│ Backend (NestJS)                                              │
│  AppGateway ── gestiona mensajes WebSocket del frontend       │
│  AccountManager ── registry de instancias de bots             │
│  BotInstance ── una por cuenta: estado + eventos              │
│    ├── BotEngine ── protocolo de red (proxy auth, login, init)│
│    ├── ActionRunner ── bucle de acciones cada 30s             │
│    ├── WarDetector ── guerras activas (2477/2478/6611)        │
│    ├── BuffManager ── escudo/buffs (proto 1111)               │
│    └── ResourceTracker ── simula producción de recursos       │
└──────────────────────────────┬──────────────────────────────┘
                               │ TCP raw (DES/ECB)
                    ┌──────────▼──────────┐
                    │ IGG proxy / game    │
                    │ server (Lords Mobile)│
                    └─────────────────────┘
```

## Flujo de datos

1. El frontend envía eventos Socket.IO (`startBot`, `stopBot`, `saveConfig`, `sendCommand`, etc.).
2. `AppGateway` los despacha; crea `BotInstance` por cuenta (`iggId`).
3. `BotInstance` inicia `BotEngine`, que:
   - `proxyAuth()` → envía el packet 0x0413 al proxy IGG → recibe IP:puerto del game server (0x03EB).
   - `connectToGameServer()` → TCP directo.
   - `goOnline()` → login packet raw (0x0414) + `sendInitSequence()` (10 paquetes).
   - Heartbeat cada 15s (proto 1024).
4. `ActionRunner` ejecuta acciones rotativas cada 30s (escudo, barco, entrenar, etc.).
5. Cada `BotInstance` emite eventos que `AppGateway` reenvía al frontend (`log`, `statusChanged`, `resources`, `inventory`, etc.).

## Módulos

### Red (`src/network/`)

| Archivo | Responsabilidad |
|---------|-----------------|
| `crypto.ts` | DES/ECB/NoPadding. `encryptBlock`/`decryptBlock` (8 bytes), `decryptFull` (multi-bloque). Key desde `DES_KEY` (.env), default `4C2A232940212638` |
| `game-client.ts` | Socket TCP: bufferiza por `[len:2][proto:2]`, descifra proto 3010, expone `send`/`sendRaw` |
| `message-packet.ts` | Build/parse de paquetes con longitud dinámica y escritores de tipos |

### Motor (`src/engine/bot-engine.ts`)

Lógica principal del protocolo:

- `waitForReply(proto)` / `resolveReply` — promesas de respuestas del servidor
- Cola de comandos (`enqueueCommand`) — serializa envíos
- Handlers de paquetes entrantes: 3404 (IDs edificios), 2851/2854 (ayudas), 2478 (guerra), 6302 (barco)
- Envío: `sendCommandPacket` (seq opcional), `sendEncrypted` (MessagePacket cifrado), `sendRaw`
- Help: `sendHelp`/`sendHelpAuto` (2855), `sendChat` (3001)

### Servicios (`src/services/`)

| Servicio | Función |
|----------|---------|
| `account-manager.ts` | Carga cuentas (MongoDB → files), mantiene `instances` |
| `bot-instance.ts` | Estado de una cuenta (inventario, recursos, tropas, marchas, líder) + auto-features (escudo, ayuda) + handlers de paquetes |
| `action-runner.ts` | Bucle de acciones cada 30s |
| `bot-action.ts` | 14 acciones rotativas: supply, daily, quests, mystery box, forge gift, chest VIP, artifact fair, cofre gremio, refine mana, barco, entrenar, escudo, ayuda |
| `war-detector.ts` | Guerras activas (2477 notificación, 2478 castillos, 6611 torres) |
| `buff-manager.ts` | Buffs/escudo (proto 1111) |
| `resource-tracker.ts` | Simula producción por hora (1s tick) con límites |
| `shield.ts` | Comprar (1408) y activar escudo (1406) |
| `daily-gift.ts` | Reclamar daily (3605 + 3130) |
| `open-gift.ts` | Cofre de gremio (2868 + 2870) |
| `train-troops.ts` | Entrenar tropas (2403) |
| `bag-helper.ts` | Selección de items de bolsa para cubrir déficits |

### Modelos (`src/models/`)

Parsers de paquetes del servidor. Los más relevantes:

| Modelo | Proto | Contenido |
|--------|-------|-----------|
| `player-info.ts` | 1008 | Datos del jugador |
| `resources.ts` | 2014 | Recursos (wheat/wood/stone/ore/gold + producción) |
| `building-state.ts` | 2001 | Construcciones |
| `construction.ts` | 2002 | Construcciones activas |
| `troop-state.ts` | 2401 | Tropas |
| `troop-training.ts` | 2402 | Entrenamiento en curso |
| `hospital.ts` | 2425 | Enfermería |
| `cargo-ship.ts` | 6302 | Barco de carga |
| `treasure-chamber.ts` | 4201 | Cámara del tesoro (estado) |
| `march-incoming.ts` | 2440 | Marcha entrante |
| `march-update.ts` | 2440 (corto) | Actualización de marcha |
| `march-packet.ts` | 2446 | Datos de tropas de marcha |
| `guild-info.ts` | 2802 | Información del gremio |
| `quest-memory.ts` | 3112 | Misiones admin/guild |
| `vip-chest.types.ts` | 3125 | Cofre VIP |
| `lord-captive.ts` | 4401/4407/4408 | Líder capturado/ejecutado |
| `essence-transmutation.ts` | 7317 | Transmutación de esencia |
| `map-packet.ts` | 2220 | Tiles del mapa |
| `bot-config.ts` | — | Configuración del bot (ver `docs/config.md`) |
| `troop-masks.ts` | — | Máscaras de tropas para guerra |

### Configuración y datos

- `config/config.service.ts` — `DES_KEY` (env), directorio `access/`, listado de cuentas, normalización de keys (camelCase).
- `database/database.service.ts` — conexión MongoDB (MONGO_URI de `.env`), modelos Token/Config/MarchHistory. Falla silenciosamente si no hay DB (usa files).
- `auth/account-info.ts` — generación de device data (UUID, UDID, etc.) para el login.

## Protocolos

- [`docs/protocols/`](protocols/) — paquetes individuales documentados.
- [`docs/connection-flow.md`](connection-flow.md) — flujo completo de conexión.
- [`docs/investigacion/`](investigacion/) — ingeniería inversa del protocolo.

## Puertos / endpoints

- Backend: `http://localhost:3000` (HTTP + Socket.IO)
- Frontend dev: `http://localhost:5173` (proxy `/socket.io` → 3000)
- Debug: `GET /debug` — lista cuentas y directorio access

## Estructura de carpetas

```
BotIgg/
├── backend/            # NestJS + TS
│   ├── scripts/        # migración JSON → MongoDB
│   └── src/
│       ├── auth/       # device data
│       ├── config/     # config service (env, access dir)
│       ├── data/       # items.json (drops, BAG_ITEMS)
│       ├── database/   # mongoose schemas
│       ├── engine/     # bot-engine (protocolo)
│       ├── models/     # parsers de paquetes
│       ├── network/    # crypto DES, tcp, message packet
│       ├── protocol/   # enum de protos
│       └── services/   # bot-instance, actions, war, etc.
├── frontend/           # Vite + React + socket.io-client
├── docs/               # esta documentación
├── access/             # cuentas (token.json/config.json) — NO subir a git
└── logs/               # logs por cuenta — NO subir a git
```
