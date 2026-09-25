# BotIgg

**Lords Mobile bot** completo y gratuito (open source). Automatiza tu cuenta de Lords Mobile de forma automática: escudo 24h, entrenamiento de tropas, barco de carga, misiones, eventos, defensa contra marchas (warMode) y monitoreo de guerras — todo desde un dashboard web.

> 🔍 **Este repo se indexa para buscar:** `lords mobile bot`, `lords mobile bots`, `lords mobile hack`, `lords mobile cheat`, `lords mobile automation`, `lords mobile autoplay`, `lords mobile auto`, `lords mobile farm bot`, `lords mobile training bot`, `lords mobile shield bot`, `lords mobile 24h shield`, `lords mobile mod`, `lords mobile script`, `lords mobile tool`, `lords mobile pc`, `bot para lords mobile`, `lords mobile bot gratis`

> ⚠️ Uso con fines de estudio/automatización personal. IGG puede invalidar sesiones duplicadas (proto 1010). No iniciar sesión en Steam con la misma cuenta mientras el bot está conectado.

## 🙏 Un mensaje antes de empezar

Estoy compartiendo **algo que nadie comparte**: todo el protocolo de Lords Mobile sacado a pulmón, el cifrado DES descifrado, cada paquete documentado y un bot completo y funcional.

No sean **sotas** 😄. Si usás esto y encontrás información nueva, un proto, un campo, un truco que falte en la documentación — **compartila**. Hacé un PR, abrí un issue o sumalo a `docs/`. Ese es el sentido de hacer esto público: entre todos construimos el conocimiento y nadie se queda con la data guardada.

— **att Denis**

## Stack

- **Backend**: TypeScript + NestJS + Socket.IO + Mongoose, conecta por TCP al servidor del juego con el cifrado DES/ECB del protocolo.
- **Frontend**: Vite + React + socket.io-client.
- **Captura de cuentas**: mitmproxy (`capture_account.py`) para obtener el `access_token` de una cuenta.

## Requisitos

- Node.js ≥ 18 (se usa `--openssl-legacy-provider` en los scripts)
- MongoDB (opcional; si no hay DB, el backend usa `access/{iggId}/` en files)
- mitmproxy (para capturar cuentas nuevas)
- El juego Lords Mobile (Steam/Android) para capturar el tráfico

## 📡 Capturar tráfico (mod PacketLogger)

Para descubrir los datos del protocolo se usa un mod de **MelonLoader** que loguea en la consola **todos los paquetes que salen cuando hacés una acción** en el juego. Con eso se pueden leer los protos y los payloads para descifrar cada paquete.

- **Framework**: MelonLoader (mod C# para IL2CPP)
- Yo lo uso en la **versión de Steam**, pero funciona en cualquier otra (Android/emulador), o directamente podés capturar el tráfico con **Wireshark** — lo que prefieras.
- El dll compilado se copia a la carpeta `Mods/` del juego:
  ```
  E:\SteamLibrary\steamapps\common\Lords Mobile\Mods\PacketLogger.dll
  ```

### Compilar el mod

La fuente está en [`mods/`](mods/PacketLogger.cs). Requiere el SDK de .NET 6 y la carpeta de MelonLoader del juego:

```powershell
dotnet build mods/PacketLogger.csproj -p:MelonLoaderPath="E:\SteamLibrary\steamapps\common\Lords Mobile\MelonLoader\net6"
```

El dll queda en `mods/bin/Release/net6.0/PacketLogger.dll` y se copia a la carpeta `Mods/` del juego. Si tenés el juego en otra ruta, pasá la tuya con `-p:MelonLoaderPath=...`.

## Instalación y arranque

```bash
# Backend
cd backend
npm install
copy .env.example .env   # completar MONGO_URI y DES_KEY
npm run dev              # http://localhost:3000

# Frontend (otra terminal)
cd frontend
npm install
npm run dev              # http://localhost:5173

# O todo junto desde la raíz
npm install
npm run dev
```

### Configurar una cuenta

1. Abre el frontend (`http://localhost:5173`).
2. Inicia el juego con mitmproxy activo y pulsa "capturar" en la UI (o usa `capture_account.py` manualmente).
3. La captura guarda el `access_token` + proxy en MongoDB y aparece en `listAccounts`.
4. Pulsa *Iniciar* en la cuenta: el bot hace proxy auth → login → init → heartbeat.

## Documentación

Todo en [`docs/`](docs/README.md):

- Arquitectura del backend
- API WebSocket (eventos Socket.IO)
- Configuración por cuenta (`BotConfig`)
- Protocolo de Lords Mobile (conexión, paquetes, cifrado DES/ECB)
- Investigación / ingeniería inversa

> 📝 La documentación **puede estar a medias**. No soy de trabajar y anotar: voy, veo qué pasa y lo documento después. Así que puede haber protos sin terminar, campos sin descifrar o notas a medias. Si encontrás algo que falta o que no cierra, sumalo — y si descubrís algo nuevo, compartilo 🙏

## Estructura

```
├── backend/     # NestJS + TS (bot + API)
├── frontend/    # Vite + React (dashboard)
├── mods/        # mod PacketLogger (captura de tráfico, MelonLoader)
├── docs/        # documentación
├── access/      # cuentas locales (token.json/config.json) — gitignored
└── logs/        # logs por cuenta — gitignored
```

## Seguridad

- El `access_token` y los proxies son secretos: `access/` y `.env` están en `.gitignore`.
- `backend/.env.example` documenta las variables necesarias sin exponer credenciales.
