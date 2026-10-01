# Reglas del proyecto

## Logs
Los archivos en ./logs pueden tener decenas de miles de líneas.
- NUNCA leas un log completo con Get-Content sin límites.
- Usá siempre `-Last N` o `-Tail N` con N chico (≤50) al leer o filtrar logs.
- Antes de hacer múltiples Select-String sueltos, pensá una sola query bien filtrada.
- Si necesitás contexto amplio del log, pedime confirmación antes de leerlo entero.

## Datos (JSON + TS)
Los módulos de datos viven en `backend/src/bot/data/*` (p. ej. `heros-db.ts` + `heros.json`, `monsters.ts` + `monsters-data.json`).
- Un `.json` NUNCA debe tener el mismo nombre base que su `.ts`: con ts-node el `require('.../monsters')` resuelve el `.json` antes que el `.ts` y el módulo exporta `undefined`.
- Para que tsc lo copie a `dist`, el loader hace `import './nombre.json';` (con `resolveJsonModule`) y lo lee con `fs.readFileSync(path.join(__dirname, 'nombre.json'))`.
- Se regeneran con `python backend/scripts/gen-*.py --alltables <dir> --tables <dir> --out <archivo.json>`.
- `items.json` no tiene `.ts` propio (lo leen `app.gateway.ts`, `bot-instance.ts`, `treasure.handler.ts` con `fs.readFileSync`); se regenera con `gen-items.py … --prev <items.json>` y conserva `gems`/`drops` manuales. El frontend lo recibe por socket (`setItemsData`), no lo importa del disco.
