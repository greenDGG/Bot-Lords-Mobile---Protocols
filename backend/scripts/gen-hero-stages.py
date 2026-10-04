#!/usr/bin/env python3
"""Genera src/bot/data/hero-stages.json: capítulos de etapas de héroe (stamina) + medallas.

Entradas:
  <gameassets>/Chapter.txt         149 B/fila (struct Chapter):
                                     u16[0] id, u16[1] nameKey, u8[4] mapId,
                                     u8[5] needLevel, u8[6] power (stamina normal),
                                     u16[64..65]@129 heroId, heroItemId, u8 num
  <gameassets>/AdvanceStage.txt     20 B/fila: idx 1..48, 3 enemies, group,
                                     3*idx, enemyLevel, prizeId, 0, 0
  <gameassets>/NormalStage.txt      20 B/fila: id 1..48, 3 enemies, ..., u5 = número
                                     global de etapa (3,6,...,144)
  <gameassets>/NormalMiniStage.txt  20 B/fila: id 1..96, ..., u5 = número global de
                                     etapa (1,2,4,5,...: todo lo que no es múltiplo de 3)
  <gameassets>/Heros.txt           136 B/fila: u16[0] id, u16[1] nameKey,
                                     u16[2] altNameKey, u16[45]@90 itemId medalla
  <gameassets>/Strings/{Spa,Eng}/StringTable{,2}.txt  key -> texto (UTF-8)
  <heros.json>                     nombres ES/EN de los héroes jugables

El mapa etapa élite -> héroe NO está en las tablas del cliente (se buscó en todas):
se toma de la wiki (páginas Chapter_1..8 "Rewards" de cada sección Elite, cruzadas
con la sección "Elite Stage(s)" de cada héroe: 20 héroes libres x 48 etapas).

Uso:
  python gen-hero-stages.py --gameassets <dir GameAssets> --heros <heros.json> \
      --out <hero-stages.json>
"""
import argparse
import json
import os
import struct
import sys

sys.stdout.reconfigure(encoding="utf-8")

CHAPTER_RS = 149
ADVANCE_RS = 20
HERO_RS = 136
MAIN_STAGES = [3, 6, 9, 12, 15, 18]

# wiki: capítulo -> {etapa principal (3..18) -> héroe EN}; posición = etapa/3
ELITE_BY_CHAPTER = {
    1: {3: "Sage of Storms", 6: "Sea Squire", 9: "Snow Queen", 12: "Incinerator",
        15: "Night Raven", 18: "Black Crow"},
    2: {3: "Oath Keeper", 6: "Trickster", 9: "Bombin' Goblin", 12: "Prima Donna",
        15: "Tracker", 18: "Soul Forger"},
    3: {3: "Black Crow", 6: "Oath Keeper", 9: "Shade", 12: "Scarlet Bolt",
        15: "Demon Slayer", 18: "Death Knight"},
    4: {3: "Sage of Storms", 6: "Sea Squire", 9: "Prima Donna", 12: "Night Raven",
        15: "Child of Light", 18: "Death Archer"},
    5: {3: "Snow Queen", 6: "Black Crow", 9: "Scarlet Bolt", 12: "Shade",
        15: "Death Knight", 18: "Demon Slayer"},
    6: {3: "Sea Squire", 6: "Trickster", 9: "Child of Light", 12: "Rose Knight",
        15: "Prima Donna", 18: "Elementalist"},
    7: {3: "Death Archer", 6: "Tracker", 9: "Soul Forger", 12: "Bombin' Goblin",
        15: "Night Raven", 18: "Incinerator"},
    8: {3: "Oath Keeper", 6: "Sage of Storms", 9: "Rose Knight", 12: "Death Knight",
        15: "Elementalist", 18: "Snow Queen"},
}


def load_rows(path, recsize):
    with open(path, "rb") as fh:
        data = fh.read()
    kind, count = struct.unpack_from("<HH", data, 0)
    if kind != 1:
        raise SystemExit(f"{os.path.basename(path)}: cabecera inesperada ({kind})")
    if 4 + count * recsize != len(data):
        raise SystemExit(
            f"{os.path.basename(path)}: {count} filas x {recsize} B != {len(data)} B"
        )
    return [data[4 + i * recsize: 4 + (i + 1) * recsize] for i in range(count)]


def load_stage_numbers(gameassets):
    """Etapa main del capítulo 1, validando la numeración global 1..144.

    NormalStage.u5 cubre los múltiplos de 3 (las 48 etapas main) y
    NormalMiniStage.u5 el resto (96 minis): entre las dos, 1..144 = 18/capítulo.
    Ese número global es el byte2 de un barrido Normal (captura cliente 1-3 → 03).
    """
    def stages(filename, keep):
        out = []
        for row in load_rows(os.path.join(gameassets, filename), 20):
            ident, stage = struct.unpack_from("<HH", row, 0)[0], struct.unpack_from("<H", row, 10)[0]
            if keep(ident):
                out.append(stage)
        return sorted(out)

    normal = stages("NormalStage.txt", lambda i: i <= 48)
    mini = stages("NormalMiniStage.txt", lambda i: True)
    all_stages = sorted(normal + mini)
    if all_stages != list(range(1, 145)):
        raise SystemExit(f"numeración de etapas inesperada: {all_stages[:12]} …")
    if len(normal) != 48 or any(s % 3 for s in normal):
        raise SystemExit("NormalStage debe tener 48 etapas múltiplos de 3")
    mains = [s for s in normal if s <= 18]
    if mains != MAIN_STAGES:
        raise SystemExit(f"etapas main del capítulo 1: {mains} != {MAIN_STAGES}")
    return mains


def make_nm(gameassets, lang):
    base = os.path.join(gameassets, "Strings", lang)
    with open(os.path.join(base, "StringTable.txt"), "rb") as fh:
        st = fh.read()
    with open(os.path.join(base, "StringTable2.txt"), "rb") as fh:
        idx = fh.read()
    data_start = struct.unpack_from("<I", st, 0)[0]

    def nm(key):
        if key <= 0 or key * 2 + 2 > len(idx):
            return ""
        i = struct.unpack_from("<H", idx, 4 + (key - 1) * 2)[0]
        if 4 + i * 8 + 8 > len(st):
            return ""
        off, length = struct.unpack_from("<II", st, 4 + i * 8)
        if data_start + 4 + off + length > len(st):
            return ""
        raw = st[data_start + 4 + off: data_start + 4 + off + length]
        return raw.decode("utf-8", "replace").strip()

    return nm


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--gameassets", required=True, help="dir GameAssets del cliente")
    ap.add_argument("--heros", required=True, help="heros.json (nombres ES/EN)")
    ap.add_argument("--out", required=True, help="hero-stages.json de salida")
    args = ap.parse_args()

    nm_es = make_nm(args.gameassets, "Spa")
    nm_en = make_nm(args.gameassets, "Eng")
    main_stages = load_stage_numbers(args.gameassets)

    with open(args.heros, encoding="utf-8") as fh:
        heroes_doc = json.load(fh)
    heroes = heroes_doc.get("heroes", {})

    medal_by_hero = {}
    hero_names = {}
    for row in load_rows(os.path.join(args.gameassets, "Heros.txt"), HERO_RS):
        u = struct.unpack_from("<68H", row, 0)
        hero_id, name_key, alt_key, medal = u[0], u[1], u[2], u[45]
        hero_names[hero_id] = (nm_es(name_key), nm_en(name_key), nm_es(alt_key))
        if medal:
            medal_by_hero[hero_id] = medal

    by_en = {}
    for key, def_ in heroes.items():
        en = (def_.get("nameEn") or "").strip()
        if en:
            by_en.setdefault(en, []).append(int(key))

    def resolve(name_en):
        ids = sorted(by_en.get(name_en, []))
        for hid in ids:
            if hid in medal_by_hero:
                return hid
        if ids:
            return ids[0]
        raise SystemExit(f"héroe de la wiki sin id en heros.json: {name_en!r}")

    advance = {}
    for row in load_rows(os.path.join(args.gameassets, "AdvanceStage.txt"), ADVANCE_RS):
        u = struct.unpack_from("<10H", row, 0)
        advance[u[0]] = {"group": u[4], "enemyLevel": u[6]}

    chapters = []
    for row in load_rows(os.path.join(args.gameassets, "Chapter.txt"), CHAPTER_RS):
        key, name_key = struct.unpack_from("<2H", row, 0)
        need_level, power = row[5], row[6]
        hero_id, hero_item, hero_num = struct.unpack_from("<HHB", row, 129)

        elite = []
        for main_stage in main_stages:
            position = main_stage // 3
            idx = (key - 1) * 6 + position
            wiki_en = ELITE_BY_CHAPTER[key][main_stage]
            hid = resolve(wiki_en)
            adv = advance.get(idx, {})
            expected_group = 19 + 24 * (key - 1) + (position - 1)
            if adv and adv["group"] != expected_group:
                raise SystemExit(
                    f"capítulo {key} posición {position}: group={adv['group']} != {expected_group}"
                )
            elite.append({
                "idx": idx,
                "position": position,
                "mainStage": main_stage,
                "heroId": hid,
                "heroName": hero_names.get(hid, ("", "", ""))[0],
                "medalItemId": medal_by_hero.get(hid),
                "enemyLevel": adv.get("enemyLevel"),
            })

        elite_ids = {e["heroId"] for e in elite}
        if hero_id not in elite_ids:
            raise SystemExit(
                f"capítulo {key}: Chapter.HeroID={hero_id} no está en sus etapas élite"
            )

        chapters.append({
            "id": key,
            "name": nm_es(name_key),
            "nameEn": nm_en(name_key),
            "needLevel": need_level,
            "staminaNormal": power,
            "staminaElite": power * 2,
            "heroId": hero_id,
            "heroName": hero_names.get(hero_id, ("", "", ""))[0],
            "heroMedalItemId": hero_item,
            "heroMedalCount": hero_num,
            "mainStages": list(main_stages),
            "elite": elite,
        })

    heroes_out = {}
    for chapter in chapters:
        for e in chapter["elite"]:
            entry = heroes_out.setdefault(str(e["heroId"]), {
                "id": e["heroId"],
                "name": e["heroName"],
                "nameEn": hero_names.get(e["heroId"], ("", "", ""))[1],
                "medalItemId": e["medalItemId"],
                "stages": [],
            })
            entry["stages"].append({
                "chapter": chapter["id"],
                "position": e["position"],
                "mainStage": e["mainStage"],
                "idx": e["idx"],
            })

    doc = {
        "source": (
            "Chapter.txt + AdvanceStage.txt + NormalStage.txt + NormalMiniStage.txt + "
            "Heros.txt (cliente) + wiki (medalla por etapa élite)"
        ),
        "generatedBy": "backend/scripts/gen-hero-stages.py",
        "mainStages": list(main_stages),
        "staminaNote": "Normal = Chapter.Power (6; 8 en cap. 8). Elite = Power x2 (12; 16 en cap. 8).",
        "sweepIdxNote": (
            "byte2 del 1805: modo Élite = elite[].idx = AdvanceStage.id 1..48 = "
            "(capítulo-1)*6+posición (captura cliente: elite de 1-3 → 01). "
            "Modo Normal = número global de etapa 1..144 = (capítulo-1)*18+etapa "
            "(captura cliente: normal de 1-3 → 03; NormalMiniStage.u5 + NormalStage.u5 "
            "cubren 1..144)."
        ),
        "chapters": chapters,
        "heroes": heroes_out,
    }

    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as fh:
        json.dump(doc, fh, ensure_ascii=False, indent=2)
        fh.write("\n")

    print(f"{args.out}: {len(chapters)} capítulos, {len(heroes_out)} héroes con medalla")


if __name__ == "__main__":
    main()
