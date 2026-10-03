# Subsidios (investigaciones)

Reducción del coste de entrenamiento **por unidad**. Hay 16 techs (ids 95-102,
104-107, 111-114) y 16 efectos (ids 280-295): 4 ramas × 4 tiers, cada unidad con
su propio subsidio. Los valores están en centésimas (4000 = 40%).

| Tier | Infantería | Caballería | Artillería (Range) | Asedio |
|------|------------|------------|--------------------|--------|
| T1 | 280 Grunt (95) | 282 Cataphract (97) | 281 Archer (96) | 283 Ballista (98) |
| T2 | 284 Gladiator (99) | 286 Reptilian Rider (101) | 285 Sharpshooter (100) | 287 Catapult (102) |
| T3 | 288 Royal Guard (104) | 290 Royal Cavalry (106) | 289 Stealth Sniper (105) | 291 Fire Trebuchet (107) |
| T4 | 292 Heroic Fighter (111) | 294 Ancient Drake Rider (113) | 293 Heroic Cannoneer (112) | 295 Destroyer (114) |

Curvas por nivel: T1/T2 (efectos 280-287) → 0.5, 1, 1.5, 2.5, 3.5, 4.5, 7, 10,
16, **40 %**; T3/T4 (efectos 288-295) → 0.5, 1, 1.5, 2, 3, 4, 5, 7, 11,
**30 %**.

## Uso en el bot

`getSubsidyPct(stats, troopType, tier)` en
`backend/src/bot/features/player-stats.ts` busca el stat por `effectId` (los
stats de este bloque vienen sólo de investigación) y devuelve el % para
`calcCost()` en `TrainAction`. La config `train` ya no guarda un % manual.
