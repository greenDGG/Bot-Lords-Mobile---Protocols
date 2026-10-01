#!/usr/bin/env python3
"""Genera src/bot/data/heros.json a partir de las tablas extraidas del cliente Lords Mobile.

Entradas (tablas .bytes extraidas con UnityPy de Table.unity3d + stringtables del cliente):
  heros.bytes      -> HeroesTbl, 136 B/fila:
                        u16[0]  id
                        u16[1]  nameKey         (nombre ES/EN segun stringtable)
                        u16[2]  altNameKey      (nombre real: Wesley, Chadra, ...)
                        u16[4]  bioKey          (historia; no se exporta)
                        u16[25..29] skillIds    (5 habilidades del héroe, en orden)
                        u16[46..49] battleSkillSlots (4 skills de tropas)
  skills.bytes     -> SkillsTbl, 78 B/fila:
                        u16[0]  id
                        u16[1]  nameKey         (0 en la 1a habilidad de cada héroe)
                        u16[3]  descKey          (descripción con colores del cliente)
  heroplaylist.bytes -> 11 B/fila, u16[0] id: lista canónica de héroes (215 ids)
  stringtable_{eng,spa}[2].bytes -> key -> texto

Notas:
  * Sólo se exportan los héroes de heroplaylist (215): las 777 filas con nameKey != 0
    incluyen NPC/monstruos de campaña (p. ej. id77 "Reclu.").
  * Battle skills: 4 slots por héroe; cada slot se decodifica como
    (byte_alto_compartido << 8) | byte_bajo, probando 3 variantes y eligiendo la que
    resuelve ids con nombre. Validado contra la wiki:
    héroe 1 = Golpe fatal + Potenciador PS infantería + Gestión suministro de comida
    + Potenciador ATQ infantería.
  * Se limpian los tags <color=...> de las descripciones.
  * Las columnas numéricas de stats propias (ATQ/DEF/HP, crecimiento, etc.) NO se
    exportan: aún no están identificadas de forma fiable.

Uso:
  python gen-heros.py --alltables <dir> --tables <dir> --out <heros.json>
"""
import argparse
import json
import os
import re
import struct
import sys

sys.stdout.reconfigure(encoding="utf-8")

HERO_RS = 136
SKILL_RS = 78
COLOR_RE = re.compile(r"</?color[^>]*>", re.IGNORECASE)
JUNK_NAMES = {"", "Reclu.", "Reclutar", "¿Reclutar?", "Hire"}


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
    return [data[4 + i * recsize : 4 + (i + 1) * recsize] for i in range(count)]


def make_nm(tables, tag):
    with open(os.path.join(tables, f"stringtable_{tag}.bytes"), "rb") as fh:
        st = fh.read()
    with open(os.path.join(tables, f"stringtable_{tag}2.bytes"), "rb") as fh:
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
        return st[data_start + 4 + off : data_start + 4 + off + length].decode("utf-8", "replace")

    return nm


def clean(text):
    return COLOR_RE.sub("", text or "").strip()


def battle_candidates(u):
    """3 variantes de decodificación de los 4 slots de battle skill (u16[46..49])."""
    return [
        [((u[47] & 0xFF) << 8) | ((u[46 + i] >> 8) & 0xFF) for i in range(4)],
        [((u[46] & 0xFF) << 8) | ((u[46 + i] >> 8) & 0xFF) for i in range(4)],
        [((u[46 + i] & 0xFF) << 8) | ((u[46 + i] >> 8) & 0xFF) for i in range(4)],
    ]


def battle_skill_ids(u, skills_by_id):
    """Elige la variante que resuelve más ids con nombre y devuelve esos ids."""
    mejor, mejor_n = [], -1
    for cand in battle_candidates(u):
        ids = [
            sid
            for sid in cand
            if sid and sid in skills_by_id and skills_by_id[sid]["name"]
        ]
        if len(ids) > mejor_n:
            mejor, mejor_n = ids, len(ids)
    return mejor


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--alltables", required=True, help="directorio con heros.bytes y skills.bytes")
    ap.add_argument("--tables", required=True, help="directorio con los stringtable_*.bytes")
    ap.add_argument("--playlist", default=None, help="heroplaylist.bytes (default: <alltables>/heroplaylist.bytes)")
    ap.add_argument("--out", required=True, help="archivo heros.json de salida")
    ap.add_argument("--indent", type=int, default=0, help="sangría del JSON (0 = una línea)")
    args = ap.parse_args()

    playlist_path = args.playlist or os.path.join(args.alltables, "heroplaylist.bytes")
    playlist = [
        struct.unpack_from("<H", row, 0)[0]
        for row in load_rows(playlist_path, 11)
    ]

    nm_es = make_nm(args.tables, "spa")
    nm_en = make_nm(args.tables, "eng")

    skill_rows = load_rows(os.path.join(args.alltables, "skills.bytes"), SKILL_RS)
    skills_by_id = {}
    for row in skill_rows:
        sid, name_key, _flag, desc_key = struct.unpack_from("<4H", row, 0)
        skills_by_id[sid] = {
            "name": clean(nm_es(name_key)),
            "nameEn": clean(nm_en(name_key)),
            "desc": clean(nm_es(desc_key)),
        }

    heroes = {}
    total = 0
    fuera_playlist = 0
    sin_nombre = 0
    skill_ids_unknown = 0
    heroes_sin_battle = 0
    playlist_set = set(playlist)
    for row in load_rows(os.path.join(args.alltables, "heros.bytes"), HERO_RS):
        total += 1
        u = struct.unpack_from("<68H", row, 0)
        hero_id, name_key = u[0], u[1]
        if hero_id not in playlist_set:
            fuera_playlist += 1
            continue
        name_es = clean(nm_es(name_key))
        name_en = clean(nm_en(name_key))
        alt_es = clean(nm_es(u[2]))
        alt_en = clean(nm_en(u[2]))
        if name_key == 0:
            # Filas sin nombre de clase: el nombre real esta en altNameKey
            # (p. ej. 104 "Magus", 107 "Escudero", 219 "Magmalius").
            name_es, name_en, alt_es, alt_en = alt_es, alt_en, "", ""
        if name_es in JUNK_NAMES or name_en in JUNK_NAMES:
            # Placeholders de heroes no liberados ("Reclu.", "Hire", ...).
            sin_nombre += 1
            continue
        skills = []
        for sid in u[25:30]:
            if sid == 0:
                continue
            info = skills_by_id.get(sid)
            if info is None:
                skill_ids_unknown += 1
                continue
            if not info["name"]:
                continue
            skills.append({"id": sid, **info})
        battle = battle_skill_ids(u, skills_by_id)
        if not battle:
            heroes_sin_battle += 1
        heroes[str(hero_id)] = {
            "id": hero_id,
            "name": name_es,
            "nameEn": name_en,
            "altName": alt_es,
            "skills": skills,
            "battleSkills": [{"id": sid, **skills_by_id[sid]} for sid in battle],
        }

    faltantes = [hid for hid in playlist if str(hid) not in heroes]
    doc = {
        "source": "heros.bytes + skills.bytes + heroplaylist.bytes + stringtables (cliente Lords Mobile)",
        "count": len(heroes),
        "heroes": heroes,
    }
    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as fh:
        json.dump(doc, fh, ensure_ascii=False, indent=args.indent)
        fh.write("\n")

    print(f"filas totales: {total}  fuera de playlist: {fuera_playlist}  sin nombre: {sin_nombre}")
    print(f"heroes exportados: {len(heroes)} / {len(playlist)} de playlist  faltantes: {faltantes}")
    print(f"heroes sin battle skills con nombre: {heroes_sin_battle}")
    print(f"habilidades con id desconocido: {skill_ids_unknown}")
    sin_nombre_txt = [k for k, v in heroes.items() if not v["name"]]
    if sin_nombre_txt:
        print(f"AVISO: {len(sin_nombre_txt)} heroes sin texto de nombre")
    print(f"-> {args.out} ({os.path.getsize(args.out)} bytes)")


if __name__ == "__main__":
    main()
