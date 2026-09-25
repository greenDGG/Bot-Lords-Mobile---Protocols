# Investigación del protocolo (Lords Mobile)

> Fuente original: `backup/.investigacion` (reorganizada y limpiada).

Documentación de la ingeniería inversa del protocolo de red de Lords Mobile (IGG), juego de Steam/Unity (IL2CPP). Cubre cifrado, secuencias de conexión, paquetes y significados descubiertos con mitmproxy, Wireshark, KeyDumper (MelonLoader) y dnSpy/Ghidra.

## Índice

| Tema | Archivo | Resumen |
|------|---------|---------|
| Cifrado DES/ECB y protocolo binario | [`cifrado-protocolo.md`](cifrado-protocolo.md) | Reverse engineering de `NetworkManager.Cipher`, key DES, formato de paquetes |
| Conexión y autenticación | [`autenticacion.md`](autenticacion.md) | Flujo login → proxy auth → login packet → init sequence |
| Info del jugador (proto 1008) | [`player-info.md`](player-info.md) | Estructura del paquete de datos del jugador |
| Defensa / marchas entrantes | [`defensa.md`](defensa.md) | Paquetes 2440/2445/2446: marchas entrantes y tropas del atacante |
| Guerra (agrupaciones) | [`guerra.md`](guerra.md) | Flujo 2476/2478/6611/7315/1144/2472, envío de tropas, tipos de agrupación |
| Construcciones (proto 2002) | [`construcciones.md`](construcciones.md) | Lista de edificios, niveles y ubicaciones |
| Items y valor en gemas | [`items.md`](items.md) | Tabla de items con su valor en gemas |
| Códigos de eventos | [`codigos-eventos.md`](codigos-eventos.md) | Protos para abrir/reclamar eventos (tienda, cofres, etc.) |
| Cofre de la Feria de Artefactos | [`cofre-artefactos.md`](cofre-artefactos.md) | Secuencia 9794 → 9778 → 9794 |
| Cámara del tesoro (proto 4201) | [`camara-tesoro.md`](camara-tesoro.md) | Nivel, gemas invertidas, duración |
| Subsidios (investigaciones) | [`subsidios.md`](subsidios.md) | Porcentajes de subsidio por nivel (ids 95-98) |
| Notas administrativas (raw) | [`admin.md`](admin.md) | Dump de bytes sin descifrar (proto 1144, sin interpretar) |

## Notas sobre dumps crudos

Los dumps de tráfico sin analizar originales (`data.txt`, `map.log`, `entry_debug.txt`, `nav_log.txt`) no se incluyen aquí por tamaño. Están disponibles en `backup/.investigacion` para consulta. `entry_debug.txt` documenta el challenge anti-bot `X-Anubis-Challenge: igg-api-guard` de `accounts.igg.com`, y `nav_log.txt` la navegación del login web (JWT de login).
