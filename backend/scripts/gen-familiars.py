#!/usr/bin/env python3
"""Genera src/bot/data/familiars.json (Monstruitos/Familiars) a partir de las
tablas extraidas del cliente Lords Mobile.

Entradas (tablas binarias del cliente + stringtables):
  Pet.txt                  -> PetTbl: nombre, rareza, army, talento(Tactics), skills[4]
  PetSkill.txt             -> PetSkillTbl: nombre, tipo (pasiva/activa) y refs de valores
  PetSkillValue.txt        -> valores por nivel de habilidad (43 B = u16 id + u32[10] + u8 unit)
  Effect.txt               -> efectos de stats: texto corto "Vel. construcción +" (14 B = 7 x u16)
  PetCombatSkill.txt       -> PetCombatSkillTbl: nombre y desc del Talento de Ejercito
  PetCombatSkillValue.txt  -> valores por nivel del talento (bloques de 6 filas)
  Strings/{Spa,Eng}/StringTable.txt + StringTable2.txt -> key -> texto

Notas de decode (validadas contra wiki/listas del juego):
  - StringTable: el archivo .txt lleva (off,len) u32 por slot y StringTable2.txt
    es el indice key->slot (u16 en 4+(key-1)*2). key K usa la posicion K-1.
  - PetTbl (81 B): Name u16@4, Rare u8@7, PetSkill[4] u16@30, Army u8@38,
    Tactics u16@61 (id del talento de ejercito, 0 = sin talento).
  - PetCombatSkill (76 B): NameKey u16@2, DescKey u16@6.
  - PetCombatSkillValue (43 B): 301 filas = 43 talentos x 6 filas (bloque).
    Dentro del bloque, el slot p2 (id 6*(T-1)+3) son los valores de %d por
    nivel (u32[10] / 100 = %), p0 (id 6*(T-1)+1) los de %f (segundos / 100),
    p3/p4/p5 otros parametros (%a, %b, %h...).

Uso:
  python gen-familiars.py --gameassets <dir> --out familiars.json
"""
import argparse
import json
import os
import struct
import sys

sys.stdout.reconfigure(encoding="utf-8")

# Army byte (PetTbl@38): tipo de tropa que cubre el talento / el monstruito
ARMY = {0: "inf", 1: "art", 2: "cav", 4: "all"}


def load_rows(path, recsize=None):
    with open(path, "rb") as fh:
        data = fh.read()
    kind, count = struct.unpack_from("<HH", data, 0)
    if kind != 1:
        raise SystemExit(f"{os.path.basename(path)}: cabecera inesperada ({kind})")
    if recsize is None:
        if (len(data) - 4) % count:
            raise SystemExit(f"{os.path.basename(path)}: longitud no divisible")
        recsize = (len(data) - 4) // count
    if 4 + count * recsize != len(data):
        raise SystemExit(
            f"{os.path.basename(path)}: {count} filas x {recsize} B != {len(data)} B"
        )
    return [data[4 + i * recsize : 4 + (i + 1) * recsize] for i in range(count)]


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
        return st[data_start + 4 + off : data_start + 4 + off + length].decode(
            "utf-8", "replace"
        )

    return nm


def strip_tags(text):
    out, depth = [], 0
    for ch in text:
        if ch == "<":
            depth += 1
        elif ch == ">" and depth:
            depth -= 1
        elif not depth:
            out.append(ch)
    return "".join(out).strip()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--gameassets", required=True, help="dir GameAssets (Pet.txt + Strings/)")
    ap.add_argument("--out", required=True, help="archivo familiars.json de salida")
    ap.add_argument("--indent", type=int, default=2, help="sangria del JSON (0 = una linea)")
    args = ap.parse_args()

    nm_es = make_nm(args.gameassets, "Spa")
    nm_en = make_nm(args.gameassets, "Eng")
    G = args.gameassets

    # --- talentsos de ejercito (PetCombatSkill + valores) ---
    talents = {}
    for row in load_rows(os.path.join(G, "PetCombatSkill.txt")):
        tid = struct.unpack_from("<H", row, 0)[0]
        name_key, desc_key = struct.unpack_from("<HH", row, 2)[0], struct.unpack_from("<H", row, 6)[0]
        talents[tid] = {
            "id": tid,
            "name": strip_tags(nm_es(name_key)),
            "nameEn": strip_tags(nm_en(name_key)),
            "desc": strip_tags(nm_es(desc_key)),
        }

    # valores por nivel: bloque de 6 filas por talento; %d en p2, %f en p0
    vrows = load_rows(os.path.join(G, "PetCombatSkillValue.txt"))
    for tid in talents:
        base = 6 * (tid - 1)
        if base + 6 > len(vrows):
            continue

        def slot(p):
            row = vrows[base + p]
            vals = [row and struct.unpack_from("<I", row, 2 + k * 4)[0] for k in range(10)]
            return vals

        pct = [round(v / 100.0, 2) for v in slot(2)]
        sec = [round(v / 100.0, 2) for v in slot(0)]
        if any(pct):
            talents[tid]["pct"] = pct
        if any(sec):
            talents[tid]["sec"] = sec

    # --- efectos de stats (Effect.txt, 14 B = 7 x u16) ---
    # ID, String_infoID (texto corto con '+'), StringID (desc larga), InfoID,
    # ValueID (key de StringTable con la unidad del stat: '', '%', ' minutos' —
    # la misma que usan investigación/talentos para agrupar), StatusIcon, EffectIcon.
    effects = {}
    for row in load_rows(os.path.join(G, "Effect.txt")):
        eid, sinfo, s_long, _info, _valid, _sicon, _eicon = struct.unpack_from("<7H", row, 0)
        effects[eid] = {
            "text": strip_tags(nm_es(sinfo)),
            "textEn": strip_tags(nm_en(sinfo)),
            "desc": strip_tags(nm_es(s_long)),
            "descEn": strip_tags(nm_en(s_long)),
            "unitText": (nm_es(_valid) or nm_en(_valid) or "").strip(),
        }

    # --- valores de habilidad (PetSkillValue.txt, 43 B = u16 id + u32[10] + u8 unit) ---
    # unit: 0 = % (valor/100), 1 = cantidad, 2 = segundos.
    pvals = {}
    for row in load_rows(os.path.join(G, "PetSkillValue.txt")):
        vid = struct.unpack_from("<H", row, 0)[0]
        pvals[vid] = {
            "values": [struct.unpack_from("<I", row, 2 + k * 4)[0] for k in range(10)],
            "unit": row[42],
        }

    # --- habilidades de monstruito ---
    # maxLevel = 10 para TODAS (ground truth: la UI del juego muestra x/10
    # siempre). PetSkill.txt@18 NO es el maxLevel (en 16 filas trae basura,
    # p. ej. skill78 = 44298), y PetSkillExp.txt tampoco define el tope de
    # visualizacion (skill39 "Cautiverio Místico" solo tiene 4 umbrales de
    # exp pero el juego la muestra /10) — ver docs/investigacion/monstruitos.md.
    #
    # PetSkill (69 B): Type@14 (2 = pasiva de stats, 1 = activa), Eff1@6 (key
    # de desc de las activas), ZValue@22 XValue@24 YValue@26 AValue@28
    # BValue@30 CValue@32 DValue@34 (ids de PetSkillValue), CoolDown@36,
    # Experience@40 (id de la curva PetSkillExp), OpenLevel[9]@42.
    #  - Pasivas: effectId = primer valor de la fila X (id de Effect.txt),
    #    texto = Effect.String_infoID, magnitud = fila Y por nivel de skill.
    #  - Activas: desc con placeholders %a..%g = filas Z,X,Y,A,B,C,D.
    LETTERS = ((22, "a"), (24, "b"), (26, "c"), (28, "d"), (30, "e"), (32, "f"), (34, "g"))
    skills = {}
    for row in load_rows(os.path.join(G, "PetSkill.txt")):
        sid = struct.unpack_from("<H", row, 0)[0]
        name_key = struct.unpack_from("<H", row, 2)[0]
        skill = {
            "id": sid,
            "name": strip_tags(nm_es(name_key)),
            "nameEn": strip_tags(nm_en(name_key)),
            "maxLevel": 10,
        }
        if row[14] == 2:
            skill["type"] = "passive"
            x_row = pvals.get(struct.unpack_from("<H", row, 24)[0])
            y_row = pvals.get(struct.unpack_from("<H", row, 26)[0])
            if x_row and x_row["values"][0]:
                effect = effects.get(x_row["values"][0])
                if effect:
                    skill["effectId"] = x_row["values"][0]
                    skill["effectText"] = effect["text"]
                    skill["effectTextEn"] = effect["textEn"]
                    skill["effectDesc"] = effect["desc"]
                    skill["effectDescEn"] = effect["descEn"]
                    skill["effectUnit"] = effect["unitText"]
            if y_row:
                skill["values"] = y_row["values"]
                skill["unit"] = y_row["unit"]
        else:
            skill["type"] = "active"
            # Subject @16: 1 = soporte (no gasta fatiga), 2 = ofensiva (gasta
            # fatiga del pool del 8230). Fatigue @38 = costo por uso (1..6).
            skill["subject"] = row[16]
            skill["fatigue"] = struct.unpack_from("<H", row, 38)[0]
            desc_key = struct.unpack_from("<H", row, 6)[0]
            if desc_key:
                skill["desc"] = strip_tags(nm_es(desc_key))
                skill["descEn"] = strip_tags(nm_en(desc_key))
            params = {}
            for off, letter in LETTERS:
                prow = pvals.get(struct.unpack_from("<H", row, off)[0])
                if prow and any(prow["values"]):
                    params[letter] = prow
            if params:
                skill["params"] = params
        skills[sid] = skill

    # --- monstruitos ---
    pets = {}
    problems = []
    for row in load_rows(os.path.join(G, "Pet.txt")):
        pid = struct.unpack_from("<H", row, 0)[0]
        name_key = struct.unpack_from("<H", row, 4)[0]
        rare = row[7]
        sk = [struct.unpack_from("<H", row, 30 + k * 2)[0] for k in range(4)]
        army = row[38]
        tactics = struct.unpack_from("<H", row, 61)[0]
        for s in sk:
            if s and s not in skills:
                problems.append(f"pet {pid}: skill {s} sin fila en PetSkill")
        if tactics and tactics not in talents:
            problems.append(f"pet {pid}: talento {tactics} sin fila en PetCombatSkill")
        if army not in ARMY:
            problems.append(f"pet {pid}: army {army} desconocido")
        pets[pid] = {
            "id": pid,
            "name": strip_tags(nm_es(name_key)),
            "nameEn": strip_tags(nm_en(name_key)),
            "rare": rare,
            "army": ARMY.get(army, str(army)),
            "talent": tactics,
            "skills": sk,
        }

    doc = {
        "source": "LordsBot-Release/GameAssets (Pet + PetSkill + PetSkillValue + Effect + PetCombatSkill)",
        "pets": pets,
        "skills": skills,
        "talents": talents,
    }
    with open(args.out, "w", encoding="utf-8") as fh:
        json.dump(doc, fh, ensure_ascii=False, indent=args.indent or None)
        fh.write("\n")

    print(f"pets={len(pets)} skills={len(skills)} talents={len(talents)} -> {args.out}")
    for p in problems:
        print(f"PROBLEMA: {p}")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
