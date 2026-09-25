# Barco de Carga (Cargo Ship) — Guía Completa

## ¿Qué es?

El barco de carga es un evento recurrente en Lords Mobile que ofrece **4 slots** de intercambio. Cada slot pide un recurso (trigo, piedra, madera, mineral u oro) a cambio de un objeto (velocidad, recursos, etc.).

El barco **expira cada 8 horas** y se renueva automáticamente.

## Flujo del bot

```
1. Bot envía 3111 (requestType=01) para solicitar datos del barco
2. Servidor responde con 3 paquetes 3112 (no en orden):
   - El más grande = barco → parseCargoShip()
   - Los otros 2 = misiones (admin/guild) → parse3112()
3. onShipUpdated() compara timestamp con config.ship.next:
   - Si es timestamp nuevo (> next) → activa intercambio (reclaim=false)
   - Si es el mismo timestamp → ignora (ya intercambiado)
4. Por cada slot:
   a. ¿Tenemos recursos suficientes en almacén?
      → Sí: envía 6305 solo con el índice del slot (descuento directo)
      → No: calcula déficit, busca items en la bolsa para cubrirlo,
             envía 6305 con índice + items de bolsa
      → Si no hay ni recursos ni items: salta el slot
5. Después de intercambiar:
   - next = timestamp de expiración del barco
   - lastExchangedTs = mismo timestamp (para no re-intercambiar)
   - cargoShip = undefined (limpia memoria)
6. Cuando now >= next → barco expiró → envía 3111 para pedir nuevos datos
```

## Packet 3111 — Solicitar datos (cliente → servidor)

Ver [`protocols/3111.md`](../protocols/3111.md).

```
3111: <seq> 01  →  Solicita barco
3111: <seq> 02  →  Solicita misiones
```

## Packet 3112 — Respuesta (servidor → cliente)

Ver [`protocols/3112.md`](../protocols/3112.md).

El servidor envía 3 paquetes 3112. Para identificar el barco: **el más grande (en bytes)**.

## Packet 6302 — Estado del barco (servidor → cliente)

Ver [`protocols/6302.md`](../protocols/6302.md).

Estructura por slot:
| Campo | Tamaño | Descripción |
|-------|--------|-------------|
| CategoryId | 1 | Categoría del objeto ofrecido |
| ObjectId | 1 | ID del objeto ofrecido |
| Quantity | 2 | Cantidad ofrecida (uint16 LE) |
| CostResource | 1 | Recurso que pide: 0=trigo, 1=piedra, 2=madera, 3=mineral, 4=oro |
| Price | 4 | Precio en unidades del recurso (uint32 LE) |
| Stars | 1 | Estrellas del objeto (1-3) |

## Packet 6305 — Intercambiar slot (cliente → servidor)

Ver [`protocols/6305.md`](../protocols/6305.md).

## Recursos e Items de bolsa

### IDs de items por recurso

| Recurso | Chico | Mediano | Grande | Mega | Ultra |
|---------|-------|---------|-------|------|-------|
| Trigo | 1009 (30K) | 1014 (150K) | 1019 (500K) | 1024 (2M) | 1029 (6M) |
| Piedra | 1010 (10K) | 1015 (50K) | 1020 (150K) | 1025 (500K) | 1030 (1.5M) |
| Madera | 1011 (10K) | 1016 (50K) | 1021 (150K) | 1026 (500K) | 1031 (1.5M) |
| Mineral | 1012 (10K) | 1017 (50K) | 1022 (150K) | 1027 (500K) | 1032 (1.5M) |
| Oro | 1013 (3K) | 1018 (15K) | 1023 (50K) | 1028 (200K) | 1033 (600K) |

### Algoritmo de selección de items
1. Ordena items de mayor a menor valor
2. Usa items que no excedan la necesidad (mínimo desperdicio)
3. Si todavía falta, usa el item más chico disponible (aunque exceda)

## Temporización

- El barco dura **8 horas** desde que aparece
- El timestamp del 6302 indica **cuándo expira** el barco
- `next` almacena ese timestamp para saber cuándo expira
- `lastExchangedTs` almacena el timestamp del último barco intercambiado para no re-intercambiar el mismo

## Config

```json
"Ship": {
  "Intercambio": true,        // activa/desactiva el barco
  "Next": 0,                  // timestamp de expiración del barco actual
  "Reclaim": true,            // true = ya intercambió este ciclo
  "LastExchangedTs": 0        // timestamp del último barco intercambiado
}
```

## Errores conocidos (ya corregidos)

- **Bucle infinito de intercambio:** El bot re-intercambiaba el mismo barco cada ~1.5 min porque:
  1. `cargoShip` nunca se limpiaba de la memoria
  2. No había forma de saber si un barco ya fue intercambiado
- **Fix:** Limpiar `cargoShip = undefined` después de intercambiar + campo `lastExchangedTs`
