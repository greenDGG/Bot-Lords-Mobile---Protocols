# Items y su valor en gemas

Tabla de items conocidos con su valor en gemas (usado por el bot para decidir compras como el escudo).

| Nombre | ID | Valor (gemas) |
|--------|----|---------------|
| Retirar escuadrón | 1001 | 40 |
| Reubicador aleatorio | 1003 | 500 |
| Reubicador | 1004 | 1500 |
| Modificador de nombre | 1006 | 100 |
| Restablecer talento | 1008 | 1000 |
| 30000 comida | 1009 | 40 |
| 10000 piedra | 1010 | 40 |
| 10000 madera | 1011 | 40 |
| 10000 mineral | 1012 | 40 |
| 3000 oro | 1013 | 40 |
| 150000 comida | 1014 | 160 |
| 50000 piedra | 1015 | 160 |
| 50000 madera | 1016 | 160 |
| 50000 mineral | 1017 | 160 |
| 15000 oro | 1018 | 160 |
| 500000 comida | 1019 | 400 |
| 150000 piedra | 1020 | 400 |
| 150000 madera | 1021 | 400 |
| 150000 mineral | 1022 | 400 |
| 50000 oro | 1023 | 400 |
| 2000000 comida | 1024 | 1200 |
| 500000 piedra | 1025 | 1200 |
| 500000 madera | 1026 | 1200 |
| 500000 mineral | 1027 | 1200 |
| 200000 oro | 1028 | 1200 |
| 6000000 comida | 1029 | 3300 |
| 1500000 piedra | 1030 | 3300 |
| 1500000 madera | 1031 | 3300 |
| 1500000 mineral | 1032 | 3300 |
| 600000 oro | 1033 | 3300 |
| 20000000 comida | 1034 | 10000 |
| 5000000 piedra | 1035 | 10000 |
| 5000000 madera | 1036 | 10000 |
| 5000000 mineral | 1037 | 10000 |
| 2000000 oro | 1038 | 10000 |
| 60000000 comida | 1039 | 28000 |
| 15000000 piedra | 1040 | 28000 |
| 15000000 madera | 1041 | 28000 |
| 15000000 mineral | 1042 | 28000 |
| 6000000 oro | 1043 | 28000 |
| Escudo 24 horas | 1052 | 1000 |
| Papiro de misión (gremio) | 1113 | 1000 |
| Papiro de misión (admin) | 1112 | 800 |
| Corazón valiente | 1115 | 2000 |
| Fruta de reanimación | 1117 | 1000 |
| Martillo de oro | 1092 | 2000 |
| 1000 de energía | 1162 | 250 |
| 2000 de energía | 1163 | 475 |
| 5000 de energía | 1164 | 1125 |
| 10.000 de energía | 1165 | 2000 |
| 20.000 de energía | 1166 | 3500 |
| 50.000 de energía | 1167 | 7500 |
| Modificador del apodo del gremio | 1253 | 200 |
| 10 de estrellas sagradas | 1305 | 30 |
| 100 de estrellas sagradas | 1306 | 240 |
| 1000 de estrellas sagradas | 1307 | 2200 |
| 10000 de estrellas sagradas | 1308 | 20000 |
| Sello emocionante | 1316 | 1500 |
| Libro arcaico | 1346 | 900 |
| 1 amuleto | 11 | 720 |
| 10 amuletos | 12 | 6600 (teoría) |
| 100 amuletos | 13 | 60000 (teoría) |
| Orbe de talento brillante | 3603 | 3000 |
| Orbe de talento radiante | 3604 | 7500 (teoría) |
| Cofre de preparación para la guerra | 3073 | ? |

## Uso en el bot

- `shield.ts` compra escudo 24h (item 1052) con proto 1408 y lo activa con proto 1406.
- Los recursos en bolsa (`BAG_ITEMS` en `data/items.json`) se usan para cubrir déficits (barco, entrenamiento, supply).
