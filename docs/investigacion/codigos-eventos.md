# Códigos de eventos y tiendas

Protos para abrir eventos, reclamar recompensas y comprar en la tienda del pionero.

## Eventos

| Proto | Payload (sin seq) | Evento |
|-------|-------------------|--------|
| 11632 | `0101` | Abrir "Encargos helados" |
| 11157 | `7000b609e5050f00000100` | Reclamar linternas (expedición encantada) |
| 11157 | `7500280a2f033200000100` | Reclamar monedas (castillo emergente) |
| 11157 | `7500380a010c2800001900` | Comprar cofres ×50 |
| 11692 | `0101` | Abrir "Arena del caos" |
| 3609 | `00 06` | Abrir "Evento solitario" |
| 3609 | `01 06` | Abrir "Evento infierno" |
| 3619 | `04 00 06` | Abrir evento "Desafío" |
| 7010 | — | Entrar al Magmante |
| 7030 | `01` | Abrir "Desafío Magmante" |
| 7001 | — | Abrir Laberinto 26 |
| 7003 | `01` | Tirar estrellas sagradas |
| 9308 | `01` | Abrir "Arena del dragón" |
| 1117 | — | Reclamar caja misteriosa |
| 3655 | `00` | Bono de acceso diario |

## Tienda del pionero

| Proto | Payload | Compra |
|-------|---------|--------|
| 11157 | `0e00970039040100001e00` | Aceleradores 3h × 30 |
| 11157 | `0e0096000305010000c800` | Acelerador curación 60m × 200 |
| 11157 | `0e0095004205010000c800` | Libro arcaico × 200 |
| 11157 | `0e0092009f0a0100003200` | Cofre monstruo × 50 |

## Envío de recursos (prueba)

```
OUT proto=2202 size=7 plain=18000000eb0048
  2452 eb0048 00000000 00000000 00000000 a0000000 0000000
  2452 db00af 0a000000 a0000000 a0000000 a0000000 a000000

OUT proto=1408 size=11 plain=0e 00 00 00 01db0024050100

2221 size=17 plain=19 00 00 00 2b040800db00ef0100db000000
   enc=1500ad08b160c660b3e687d696cd3a4813
```

## Notas

- Proto 3606: no se sabe bien cómo funciona.
- El payload de `11157` cambia según el evento (primer byte indica el tipo de operación).
- `dark.md` (protos 3288, 7321, 7318) no tiene más contexto registrado.
