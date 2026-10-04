#!/usr/bin/env python3
"""Genera backend/src/bot/data/emojis.json (emoticonos del chat).

Fuentes (GameAssets del cliente):
  EMOJI.txt  - 235 filas x 32 B: u16 id, u16 pagina, u32 idx (orden en la
               pagina), u16 w, u16 h ... El id que viaja por el wire es
               `pagina*128 + n` (ver docs/teories/emojis.md).
  Item.txt   - 88 B/fila: u16 itemId@0, u16 nameKey@2, u16 descKey@6 y
               u16 emojiId@20. Los items cuya descripcion habla de
               "emote"/"emoticon" son los emoticonos comprables: hay UNO por
               emoji de las paginas 5..24 (195 de 235) y ahi estan los
               nombres (Spa/Eng) via StringTable.
  Strings/{Spa,Eng}/StringTable*.txt - nombres.

Los 40 emojis de las paginas 0..4 (los basicos, siempre disponibles) no
tienen item ni nombre en ningun archivo del cliente: se incluyen igual con
itemId 0 y nombre null, para poder mandarlos por wire (tienen idx valido).

Uso:
  python backend/scripts/gen-emojis.py --gameassets <dir GameAssets> \
      --out backend/src/bot/data/emojis.json
"""
import argparse
import json
import os
import struct
import sys

EMOTE_WORDS = ("emote", "emoticon")


def load_rows(path):
    data = open(path, "rb").read()
    kind, count = struct.unpack_from("<HH", data, 0)
    if kind != 1:
        raise SystemExit(f"{os.path.basename(path)}: kind inesperado {kind}")
    rec = (len(data) - 4) // count
    if rec * count != len(data) - 4:
        raise SystemExit(f"{os.path.basename(path)}: recsize {rec} no divide el payload")
    return [data[4 + i * rec: 4 + (i + 1) * rec] for i in range(count)], rec


def nm_factory(gameassets, lang):
    base = os.path.join(gameassets, "Strings", lang)
    st = open(os.path.join(base, "StringTable.txt"), "rb").read()
    idx = open(os.path.join(base, "StringTable2.txt"), "rb").read()
    data_start = struct.unpack_from("<I", st, 0)[0]

    def nm(key):
        if key <= 0 or 4 + key * 2 > len(idx):
            return None
        i = struct.unpack_from("<H", idx, 4 + (key - 1) * 2)[0]
        if i == 0 or 4 + i * 8 + 8 > len(st):
            return None
        off, length = struct.unpack_from("<II", st, 4 + i * 8)
        if data_start + 4 + off + length > len(st):
            return None
        raw = st[data_start + 4 + off: data_start + 4 + off + length].decode("utf-8", "replace")
        out, depth = [], 0
        for ch in raw:
            if ch == "[":
                depth += 1
            elif ch == "]":
                if depth:
                    depth -= 1
            elif depth == 0:
                out.append(ch)
        return "".join(out).strip() or None
    return nm


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--gameassets", required=True, help="directorio GameAssets del cliente")
    ap.add_argument("--out", default=os.path.join("backend", "src", "bot", "data", "emojis.json"))
    args = ap.parse_args()

    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    ga = args.gameassets
    nm_spa = nm_factory(ga, "Spa")
    nm_eng = nm_factory(ga, "Eng")

    emoji_rows, _ = load_rows(os.path.join(ga, "EMOJI.txt"))
    emojis = {}
    for r in emoji_rows:
        # u16 id@0, u16 page@2, u32 idx@4, u16 w@8, u16 h@10
        eid, page = struct.unpack_from("<HH", r, 0)
        idx = struct.unpack_from("<I", r, 4)[0]
        w, h = struct.unpack_from("<HH", r, 8)
        emojis[eid] = {"id": eid, "page": page, "idx": idx, "w": w, "h": h}

    item_rows, _ = load_rows(os.path.join(ga, "Item.txt"))
    by_emoji = {}
    items_emote = 0
    for r in item_rows:
        uid, namek, _typ, desck = struct.unpack_from("<HHHH", r, 0)
        emoji_id = struct.unpack_from("<H", r, 20)[0]
        desc = ((nm_eng(desck) or "") + " " + (nm_spa(desck) or "")).lower()
        if not any(w in desc for w in EMOTE_WORDS):
            continue
        items_emote += 1
        if emoji_id not in emojis:
            continue
        entry = {
            **emojis[emoji_id],
            "itemId": uid,
            "name": nm_spa(namek),
            "nameEn": nm_eng(namek),
        }
        prev = by_emoji.get(emoji_id)
        # con nombre gana al item sin nombre (hay items-emote huérfanos)
        if prev is None or (not (prev["name"] or prev["nameEn"]) and (entry["name"] or entry["nameEn"])):
            by_emoji[emoji_id] = entry

    basic = sorted(set(emojis) - set(by_emoji))
    # Los basicos (sin item) entran igual: itemId 0 = siempre disponible.
    for eid in basic:
        by_emoji[eid] = {**emojis[eid], "itemId": 0, "name": None, "nameEn": None}

    out = {
        "source": "LordsBot-Release/GameAssets (EMOJI + Item + Strings/{Spa,Eng})",
        "generatedBy": "gen-emojis.py",
        "note": (
            "Emoticonos del chat (proto 3001/3003). Los 40 basicos (paginas 0-4) "
            "vienen con itemId 0 (siempre disponibles) y nombre null; los otros "
            "195 se desbloquean con su item (itemId) y sólo se pueden usar si "
            "estan en el inventario."
        ),
        "count": len(by_emoji),
        "emojis": [by_emoji[e] for e in sorted(by_emoji)],
    }
    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, indent=2)
        fh.write("\n")

    print(f"emojis en EMOJI.txt: {len(emojis)}")
    print(f"items con descripci��n de emote: {items_emote}")
    print(f"emojis escritos: {len(by_emoji)} ({len(basic)} basicos) -> {args.out}")


if __name__ == "__main__":
    main()
