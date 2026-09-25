# Documentación de BotIgg

Bot para Lords Mobile (IGG): conecta cuentas, mantiene escudo, entrena tropas, intercambia el barco de carga, defiende contra marchas y monitorea guerras, todo desde un dashboard web.

## Índice

### Guías de usuario
- [Configuración del bot (`BotConfig`)](config.md) — todos los campos de configuración por cuenta
- [Guía del Barco de Carga](guides/cargo-ship.md)

### Arquitectura y desarrollo
- [Arquitectura del backend](architecture.md) — módulos, flujo de datos, red DES/ECB
- [API WebSocket](websocket-api.md) — eventos Socket.IO frontend ↔ backend

### Protocolo de Lords Mobile
- [Flujo de conexión](connection-flow.md) — token → proxy auth → login → init → heartbeat
- [Protocolos documentados](protocols/index.md) — paquetes individuales
- [Concepto: seq](protocols/seq.md) — número de secuencia

### Ingeniería inversa
- [Investigación del protocolo](investigacion/README.md) — cifrado, defensa, guerra, items, eventos
