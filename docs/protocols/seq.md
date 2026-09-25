# Sequence Number (Seq)

## ¿Qué es?

El **seq** (sequence number) es un número entero que identifica cada paquete que el bot **envía** al servidor del juego. Es como un "turno" o "folio": cada paquete lleva un número único para que el servidor pueda ordenarlos y detectar si falta alguno.

## Reglas básicas

- **Empieza en 1** cuando el bot se conecta
- **Aumenta en +1** por cada paquete enviado
- **Nunca se repite** dentro de una misma sesión de conexión
- Se escribe en **formato uint32 (4 bytes, Little Endian)**

## Dónde va el seq

Dentro del **body** del paquete, **siempre al principio** (primeros 4 bytes):

```
body = [seq:4] [resto del payload...]
```

Ejemplo con init #1 (1020):
```
body = [seq:4] [IGG_ID:4] [0x00000000:4]
       ^^^^^^^^
       este es el seq
```

## El seq es por paquete, no por tarea

- Si el bot envía init #1 con seq=1, init #2 con seq=2, etc.
- El heartbeat tiene su **propio seq independiente** (empieza en 1 también)
- Cada `SendCommandPacket` con `includeSeq=true` consume un seq del contador global

## ¿Qué pasa si el seq está mal?

- Si se **repite** un seq, el servidor lo ignora (lo ve como duplicado)
- Si se **salta** un seq (ej: pasa de 3 a 5), el servidor puede ignorar paquetes o cerrar la conexión
- Si el seq se **desincroniza** (el bot piensa que va en 10 pero el servidor espera 12), los comandos dejan de funcionar

## Dato importante

- Los paquetes que usan el **contador global de seq** son los de la **secuencia de init** y los comandos que llevan `includeSeq=true`
- Los paquetes que se envían **sin seq** (raw/plaintext) no llevan este número
- El heartbeat (proto 1024) usa un contador **separado** que solo él maneja
