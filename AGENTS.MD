# Reglas del proyecto

## Logs
Los archivos en ./logs pueden tener decenas de miles de líneas.
- NUNCA leas un log completo con Get-Content sin límites.
- Usá siempre `-Last N` o `-Tail N` con N chico (≤50) al leer o filtrar logs.
- Antes de hacer múltiples Select-String sueltos, pensá una sola query bien filtrada.
- Si necesitás contexto amplio del log, pedime confirmación antes de leerlo entero.