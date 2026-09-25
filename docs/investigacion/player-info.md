# Info del jugador (proto 1008)

Estructura descifrada del paquete con los datos del jugador (`backend/src/models/player-info.ts` lo parsea).

```
00 00 00 00                   = Cabecera, siempre 00 (4 bytes)
9c f3 ac 29 00 00 00 00       = Id (8 bytes)
31 32 33 34 35 6c 70 38 39 30 31 53 00 1d 00  = Name (15 bytes, null-terminated)
3c                            = Nivel del jugador (1 byte)
77 00 00 00                   = ?? (no confirmado) (4 bytes)
9501                          = Resistencia/corazones (2 bytes)
04 1f 37 6a 00 00 00 00       = Timestamp (8 bytes)
5e 78 52 6a 00 00 00 00       = Timestamp (8 bytes)
4a 78 52 6a 00 00 00 00       = Timestamp (8 bytes)
ff ff                         = ?? (aparentemente fijo) (2 bytes)
ff fb                         = ?? (2 bytes)
8e a3                         = Gemas (2 bytes LE = 0xa38e)
```

## Zona de 126 bytes sin descifrar

Después de las gemas vienen ~126 bytes poco conocidos:

```
00 00 0a 1a 69 a1 62 ...  (mezcla de datos)
ff bf fe ff ef ff ff ff ff ff ff ff   (máscara de flags)
03×39 (con un 02)                       (probablemente niveles de edificios/castillo)
90 00 2c 00 ...
eb 03 88 00 ...
```

## Campos conocidos posteriores

```
fa f3 a5 2b 00 00 00 00   = Power (8 bytes)
91 c9 41 14 00 00 00 00   = Kills (8 bytes)
fc 8c 12 00               = Experiencia VIP (4 bytes)
```

Después ~180 bytes poco conocidos (incluye buffs, research, edificios) y finalmente:

```
d4 00 00 00   = Energía (4 bytes)
```

El resto del paquete no es de importancia.
