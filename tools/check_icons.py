#!/usr/bin/env python3
"""
Staging-Check für die Shopping-List-Card Icons.

Quelle der Wahrheit: dieser Datei eingebettete TARGETS (aus mapping.json auf dem
HA-Server + 9 Kategorie-Icons). Der Nutzer lädt manuell Flaticon-SVGs (512×512)
herunter, benennt sie exakt wie den Zieldateinamen und legt sie in
icons-staging/items/ bzw. icons-staging/categories/ ab.

Aufruf:
  python3 tools/check_icons.py            # Fehlliste (default)
  python3 tools/check_icons.py --checklist # schreibt icons-staging/CHECKLIST.md
  python3 tools/check_icons.py --all       # beides

Ein Eintrag mit copy_of wird NICHT manuell gebraucht — er wird automatisch aus
dem Original erzeugt, sobald dieses vorliegt.
"""
from __future__ import annotations
import os, sys, json

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STAGING = os.path.join(ROOT, "icons-staging")

# Kategorie-Metadaten (label + Reihenfolge)
CATEGORIES = {
    "obst_gemuese":      "Obst & Gemüse",
    "brot_backwaren":    "Brot & Backwaren",
    "milch_eier":        "Milchprodukte & Eier",
    "fleisch_fisch":     "Fleisch, Fisch & Alternativen",
    "trockenwaren":      "Trockenwaren & Vorräte",
    "tiefkuehllprodukte": "Tiefkühlprodukte",
    "getraenke":         "Getränke",
    "haushalt_hygiene":  "Haushalt & Hygiene",
    "sonstiges":         "Sonstiges",
}
CAT_ORDER = list(CATEGORIES.keys())

# items: filename -> {label, query (Flaticon EN), cat, copy_of?}
# 116 Einträge aus mapping.json (Stand 2026-08-10), Wahrheit für den Code.
ITEMS = {
    "ananas.svg":        ("Ananas",        "pineapple",            "obst_gemuese"),
    "apfel.svg":         ("Apfel",         "apple",                "obst_gemuese"),
    "aubergine.svg":     ("Aubergine",     "eggplant",             "obst_gemuese"),
    "avocado.svg":       ("Avocado",       "avocado",              "obst_gemuese"),
    "bananen.svg":       ("Bananen",       "banana",               "obst_gemuese"),
    "birne.svg":         ("Birne",         "pear",                 "obst_gemuese"),
    "blumenkohl.svg":    ("Blumenkohl",    "cauliflower",          "obst_gemuese"),
    "brokkoli.svg":      ("Brokkoli",      "broccoli",             "obst_gemuese"),
    "erdbeeren.svg":     ("Erdbeeren",     "strawberry",           "obst_gemuese"),
    "gurke.svg":         ("Gurke",         "cucumber",             "obst_gemuese"),
    "himbeeren.svg":     ("Himbeeren",     "raspberry",            "obst_gemuese"),
    "karotten.svg":      ("Karotten",      "carrot",               "obst_gemuese"),
    "kartoffeln.svg":    ("Kartoffeln",    "potato",               "obst_gemuese"),
    "kirschen.svg":      ("Kirschen",      "cherries",             "obst_gemuese"),
    "kiwi.svg":          ("Kiwi",          "kiwi fruit",           "obst_gemuese"),
    "knoblauch.svg":     ("Knoblauch",     "garlic",               "obst_gemuese"),
    "mandarine.svg":     ("Mandarine",     "tangerine",            "obst_gemuese", "orange.svg"),
    "mango.svg":         ("Mango",         "mango",                "obst_gemuese"),
    "melone.svg":        ("Melone",        "melon",                "obst_gemuese"),
    "orange.svg":        ("Orange",        "orange fruit",         "obst_gemuese"),
    "paprika.svg":       ("Paprika",       "bell pepper",          "obst_gemuese"),
    "pfirsich.svg":      ("Pfirsich",      "peach",                "obst_gemuese"),
    "pflaume.svg":       ("Pflaume",       "plum",                 "obst_gemuese"),
    "pilze.svg":         ("Pilze",         "mushroom",             "obst_gemuese"),
    "champignons.svg":   ("Champignons",   "mushroom",             "obst_gemuese", "pilze.svg"),
    "radieschen.svg":    ("Radieschen",    "radish",               "obst_gemuese"),
    "salat.svg":         ("Salat",         "lettuce",              "obst_gemuese"),
    "spinat.svg":        ("Spinat",        "spinach",              "obst_gemuese"),
    "tomaten.svg":       ("Tomaten",       "tomato",               "obst_gemuese"),
    "trauben.svg":       ("Trauben",       "grapes",               "obst_gemuese"),
    "weintrauben.svg":   ("Weintrauben",   "grapes",               "obst_gemuese", "trauben.svg"),
    "zwiebeln.svg":      ("Zwiebeln",      "onion",                "obst_gemuese"),
    "zitrone.svg":       ("Zitrone",       "lemon",                "obst_gemuese"),
    "zucchini.svg":      ("Zucchini",      "zucchini",             "obst_gemuese"),
    "kuerbis.svg":       ("Kürbis",        "pumpkin",              "obst_gemuese"),
    "mais.svg":          ("Mais",          "corn",                 "obst_gemuese"),
    "bratkartoffeln.svg":("Bratkartoffeln","fried potatoes",       "obst_gemuese"),
    "brot.svg":          ("Brot",          "bread loaf",           "brot_backwaren"),
    "broetchen.svg":     ("Brötchen",      "bread roll",           "brot_backwaren"),
    "toast.svg":         ("Toast",         "toast bread slice",     "brot_backwaren"),
    "baguette.svg":      ("Baguette",      "baguette",             "brot_backwaren"),
    "croissants.svg":    ("Croissants",    "croissant",            "brot_backwaren"),
    "kuchen.svg":         ("Kuchen",        "cake",                 "brot_backwaren"),
    "wraps.svg":          ("Wraps",         "wrap food",             "brot_backwaren"),
    "milch.svg":         ("Milch",         "milk bottle",          "milch_eier"),
    "joghurt.svg":       ("Joghurt",       "yogurt",               "milch_eier"),
    "sahne.svg":         ("Sahne",         "cream",                "milch_eier"),
    "butter.svg":        ("Butter",        "butter",               "milch_eier"),
    "kaese.svg":         ("Käse",          "cheese",               "milch_eier"),
    "schafkaese.svg":    ("Schafskäse",    "feta cheese",          "milch_eier"),
    "ofenkaese.svg":     ("Ofenkäse",      "baked cheese",         "milch_eier", "kaese.svg"),
    "quark.svg":         ("Quark",         "curd cheese",          "milch_eier"),
    "frischkaese.svg":   ("Frischkäse",    "cream cheese",         "milch_eier"),
    "mozzarella.svg":    ("Mozzarella",    "mozzarella",           "milch_eier"),
    "eier.svg":          ("Eier",          "egg",                  "milch_eier"),
    "cheddar.svg":        ("Cheddar",       "cheddar cheese",       "milch_eier"),
    "haehnchen.svg":     ("Hähnchen",      "chicken meat",         "fleisch_fisch"),
    "hackfleisch.svg":   ("Hackfleisch",   "minced meat",          "fleisch_fisch"),
    "schnitzel.svg":     ("Schnitzel",     "schnitzel cutlet",     "fleisch_fisch"),
    "steaks.svg":        ("Steaks",        "steak",                "fleisch_fisch"),
    "wurst.svg":         ("Wurst",         "sausage",             "fleisch_fisch"),
    "bratwuerstchen.svg":("Bratwürstchen", "bratwurst",            "fleisch_fisch", "wurst.svg"),
    "aufschnitt.svg":   ("Aufschnitt",    "cold cuts",            "fleisch_fisch", "wurst.svg"),
    "schinken.svg":      ("Schinken",      "ham",                  "fleisch_fisch"),
    "fisch.svg":         ("Fisch",         "fish",                 "fleisch_fisch"),
    "fischstaechen.svg": ("Fischstäbchen", "fish",                 "fleisch_fisch", "fisch.svg"),
    "lachs.svg":         ("Lachs",         "salmon",              "fleisch_fisch"),
    "garnelen.svg":      ("Garnelen",      "shrimp",               "fleisch_fisch"),
    "tofu.svg":          ("Tofu",          "tofu",                "fleisch_fisch"),
    "lamm.svg":           ("Lamm",          "lamb meat",            "fleisch_fisch"),
    "nudeln.svg":        ("Nudeln",        "pasta",               "trockenwaren"),
    "spaghetti.svg":     ("Spaghetti",     "spaghetti",           "trockenwaren"),
    "reis.svg":          ("Reis",          "rice",                "trockenwaren"),
    "mehl.svg":          ("Mehl",          "flour",               "trockenwaren"),
    "zucker.svg":        ("Zucker",        "sugar",               "trockenwaren"),
    "salz.svg":          ("Salz",          "salt",                "trockenwaren"),
    "pfeffer.svg":       ("Pfeffer",       "pepper mill",         "trockenwaren"),
    "olivenoel.svg":     ("Olivenöl",      "olive oil",           "trockenwaren"),
    "essig.svg":         ("Essig",         "vinegar",             "trockenwaren"),
    "ketchup.svg":       ("Ketchup",       "ketchup",             "trockenwaren"),
    "mayonnaise.svg":    ("Mayonnaise",    "mayonnaise",          "trockenwaren"),
    "senf.svg":          ("Senf",          "mustard",             "trockenwaren"),
    "honig.svg":         ("Honig",         "honey jar",            "trockenwaren"),
    "marmelade.svg":     ("Marmelade",     "jam jar",             "trockenwaren"),
    "linsen.svg":         ("Linsen",        "lentils",              "trockenwaren"),
    "tiefkuehlpizza.svg":("Tiefkühlpizza", "pizza",               "tiefkuehllprodukte"),
    "pommes.svg":        ("Pommes",        "french fries",         "tiefkuehllprodukte"),
    "eis.svg":           ("Eis",           "ice cream",           "tiefkuehllprodukte"),
    "tk-gemuese.svg":    ("TK-Gemüse",     "frozen vegetables",   "tiefkuehllprodukte"),
    "waffeln.svg":        ("Waffeln",       "waffles",             "tiefkuehllprodukte"),
    "wasser.svg":        ("Wasser",        "water bottle",        "getraenke"),
    "saft.svg":          ("Saft",          "juice",               "getraenke"),
    "cola.svg":          ("Cola",          "cola",                "getraenke"),
    "bier.svg":          ("Bier",          "beer",                "getraenke"),
    "wein.svg":          ("Wein",          "wine glass",           "getraenke"),
    "weisswein.svg":     ("Weißwein",      "white wine",           "getraenke", "wein.svg"),
    "rotwein.svg":       ("Rotwein",       "red wine",            "getraenke", "wein.svg"),
    "kaffee.svg":        ("Kaffee",        "coffee cup",          "getraenke"),
    "tee.svg":           ("Tee",           "tea cup",             "getraenke"),
    "toilettenpapier.svg":("Toilettenpapier","toilet paper roll", "haushalt_hygiene"),
    "kuechenrolle.svg":  ("Küchenrolle",   "paper towel",         "haushalt_hygiene", "toilettenpapier.svg"),
    "shampoo.svg":       ("Shampoo",       "shampoo bottle",       "haushalt_hygiene"),
    "duschgel.svg":      ("Duschgel",      "shower gel",          "haushalt_hygiene", "shampoo.svg"),
    "seife.svg":         ("Seife",         "soap bar",            "haushalt_hygiene"),
    "zahnpasta.svg":     ("Zahnpasta",     "toothpaste",          "haushalt_hygiene"),
    "waschmittel.svg":   ("Waschmittel",   "laundry detergent",   "haushalt_hygiene"),
    "weichspueler.svg":  ("Weichspüler",   "fabric softener",     "haushalt_hygiene", "waschmittel.svg"),
    "spuelmittel.svg":   ("Spülmittel",    "dish soap",           "haushalt_hygiene"),
    "muellbeutel.svg":   ("Müllbeutel",    "trash bag",           "haushalt_hygiene"),
    "alufolie.svg":       ("Alufolie",      "aluminum foil",       "haushalt_hygiene"),
    "schokolade.svg":    ("Schokolade",    "chocolate bar",       "sonstiges"),
    "kekse.svg":         ("Kekse",         "cookies",             "sonstiges"),
    "nuesse.svg":        ("Nüsse",         "nuts",                "sonstiges"),
    "mandeln.svg":       ("Mandeln",       "almonds",             "sonstiges", "nuesse.svg"),
    "chips.svg":         ("Chips",         "potato chips",        "sonstiges"),
    "asiatisch.svg":      ("Asiatisch",     "asian food",          "sonstiges"),

    # === 41 neu iconisierte Artikel (lastbatch 2026-08-10: 39 gerettet + Kaviar/Biobeutel) ===
    "kraeuterbaguettes.svg":   ("Kräuterbaguettes",   "herb baguette",   "brot_backwaren"),
    "lebkuchen.svg":   ("Lebkuchen",   "gingerbread",   "brot_backwaren"),
    "haehnchenbrust.svg":   ("Hähnchenbrust",   "chicken breast",   "fleisch_fisch"),
    "haehnchenkeule.svg":   ("Hähnchenkeule",   "chicken leg",   "fleisch_fisch"),
    "kaviar.svg":   ("Kaviar",   "caviar",   "fleisch_fisch"),
    "sekt.svg":   ("Sekt",   "sparkling wine",   "getraenke"),
    "abwaschbuerste.svg":   ("Abwaschbürste",   "dish brush",   "haushalt_hygiene"),
    "biobeutel.svg":   ("Biobeutel",   "biodegradable bag",   "haushalt_hygiene"),
    "deo.svg":   ("Deo",   "deodorant",   "haushalt_hygiene"),
    "frischhaltefolie.svg":   ("Frischhaltefolie",   "cling film",   "haushalt_hygiene"),
    "kuechentuecher.svg":   ("Küchentücher",   "kitchen towel",   "haushalt_hygiene"),
    "buttermilch.svg":   ("Buttermilch",   "buttermilk",   "milch_eier"),
    "griechischer_joghurt.svg":   ("Griechischer Joghurt",   "greek yogurt",   "milch_eier"),
    "kefir.svg":   ("Kefir",   "kefir",   "milch_eier"),
    "ricotta.svg":   ("Ricotta",   "ricotta cheese",   "milch_eier"),
    "aprikose.svg":   ("Aprikose",   "apricot",   "obst_gemuese"),
    "blattspinat.svg":   ("Blattspinat",   "spinach",   "obst_gemuese"),
    "brombeeren.svg":   ("Brombeeren",   "blackberry",   "obst_gemuese"),
    "chinakohl.svg":   ("Chinakohl",   "chinese cabbage",   "obst_gemuese"),
    "clementine.svg":   ("Clementine",   "clementine",   "obst_gemuese"),
    "cranberry.svg":   ("Cranberry",   "cranberry",   "obst_gemuese"),
    "datteln.svg":   ("Datteln",   "date fruit",   "obst_gemuese"),
    "dill.svg":   ("Dill",   "dill herb",   "obst_gemuese"),
    "eisbergsalat.svg":   ("Eisbergsalat",   "iceberg lettuce",   "obst_gemuese"),
    "feige.svg":   ("Feige",   "fig fruit",   "obst_gemuese"),
    "feldsalat.svg":   ("Feldsalat",   "lamb lettuce",   "obst_gemuese"),
    "gemuesepfanne.svg":   ("Gemüsepfanne",   "vegetable stir fry",   "obst_gemuese"),
    "granatapfel.svg":   ("Granatapfel",   "pomegranate",   "obst_gemuese"),
    "heidelbeeren.svg":   ("Heidelbeeren",   "blueberry",   "obst_gemuese"),
    "johannisbeeren.svg":   ("Johannisbeeren",   "currant",   "obst_gemuese"),
    "lauch.svg":   ("Lauch",   "leek",   "obst_gemuese"),
    "mangold.svg":   ("Mangold",   "swiss chard",   "obst_gemuese"),
    "nektarine.svg":   ("Nektarine",   "nectarine",   "obst_gemuese"),
    "pak_choi.svg":   ("Pak Choi",   "bok choy",   "obst_gemuese"),
    "pampelmuse.svg":   ("Pampelmuse",   "grapefruit",   "obst_gemuese"),
    "pastinake.svg":   ("Pastinake",   "parsnip",   "obst_gemuese"),
    "peperoni.svg":   ("Peperoni",   "chili pepper",   "obst_gemuese"),
    "petersilie.svg":   ("Petersilie",   "parsley",   "obst_gemuese"),
    "preiselbeeren.svg":   ("Preiselbeeren",   "lingonberry",   "obst_gemuese"),
    "ravioli.svg":   ("Ravioli",   "ravioli",   "trockenwaren"),
    "tortellini.svg":   ("Tortellini",   "tortellini",   "trockenwaren"),
}

# 9 Kategorie-Icons
CATEGORY_ICONS = {
    "obst_gemuese.svg":       ("Obst & Gemüse",                 "fruit and vegetables basket"),
    "brot_backwaren.svg":      ("Brot & Backwaren",              "bread bakery"),
    "milch_eier.svg":          ("Milchprodukte & Eier",          "milk and eggs dairy"),
    "fleisch_fisch.svg":       ("Fleisch, Fisch & Alternativen","meat and fish"),
    "trockenwaren.svg":        ("Trockenwaren & Vorräte",        "pantry groceries"),
    "tiefkuehllprodukte.svg":  ("Tiefkühlprodukte",              "frozen food snowflake"),
    "getraenke.svg":           ("Getränke",                      "beverages drinks"),
    "haushalt_hygiene.svg":    ("Haushalt & Hygiene",            "household cleaning supplies"),
    "sonstiges.svg":           ("Sonstiges",                     "shopping basket"),
}


def _norm(fn):
    return fn.lower()


def _present(folder):
    if not os.path.isdir(folder):
        return set()
    return {_norm(f) for f in os.listdir(folder) if f.lower().endswith(".svg")}


def _entry(item):
    """gibt (label, query, cat, copy_of) zurück (copy_of evtl. None)."""
    if len(item) == 4:
        return item[0], item[1], item[2], item[3]
    return item[0], item[1], item[2], None


def collect():
    items_present = _present(os.path.join(STAGING, "items"))
    cats_present = _present(os.path.join(STAGING, "categories"))
    rows = []  # (filename, label, query, cat, copy_of, kind, present)
    for fn, val in ITEMS.items():
        label, query, cat, copy_of = _entry(val)
        present = _norm(fn) in items_present
        # Kopie gilt als erfüllt, wenn Original vorliegt
        if copy_of and not present and _norm(copy_of) in items_present:
            present = True
        rows.append((fn, label, query, cat, copy_of, "item", present))
    for fn, (label, query) in CATEGORY_ICONS.items():
        present = _norm(fn) in cats_present
        rows.append((fn, label, query, "categories", None, "cat", present))
    return rows


def report():
    rows = collect()
    # Gruppiere nach Kategorie
    by_cat = {}
    for r in rows:
        by_cat.setdefault(r[3], []).append(r)
    total = len(rows)
    present = sum(1 for r in rows if r[6])
    missing_download = []   # fehlt UND kein copy_of -> muss heruntergeladen werden
    missing_autocopy = []    # fehlt, ist copy_of, Original fehlt auch
    for r in rows:
        fn, label, query, cat, copy_of, kind, p = r
        if p:
            continue
        if copy_of:
            # Original-fehlt prüfen
            orig_present = any(x[0] == copy_of and x[6] for x in rows)
            if not orig_present:
                missing_autocopy.append(r)
        else:
            missing_download.append(r)

    print("=" * 70)
    print(f"Icon-Staging: {present}/{total} vorhanden  —  {total - present} fehlen")
    print("=" * 70)
    if not missing_download and not missing_autocopy:
        print("\n✅ Alles komplett! Bereit zum Upload auf den HA-Server.")
        return 0

    # Zu herunterladende (gruppiert nach Kategorie, mit Flaticon-Query)
    print(f"\n▼ NOCH HERUNTERZULADEN ({len(missing_download)} Icons)")
    print("  → auf flaticon.com suchen, SVG 512×512 downloaden, exakt so benennen\n    und in icons-staging/items/ bzw. icons-staging/categories/ legen.\n")
    for cat in CAT_ORDER + ["categories"]:
        bucket = [r for r in missing_download if r[3] == cat]
        if not bucket:
            continue
        name = CATEGORIES[cat] if cat in CATEGORIES else "Kategorie-Icons"
        where = "categories/" if cat == "categories" else "items/"
        print(f"  [{name}]  ({len(bucket)} fehlen, Zielordner: icons-staging/{where})")
        for fn, label, query, _, _, kind, _ in sorted(bucket):
            print(f"    {fn:<24} ← Suche: \"{query}\"   ({label})")
        print()

    if missing_autocopy:
        print(f"▼ AUTO-KOPIEN ({len(missing_autocopy)} — folgen automatisch, sobald Original da ist)")
        for fn, label, query, cat, copy_of, kind, _ in sorted(missing_autocopy):
            print(f"    {fn:<24} ← Kopie von {copy_of}   ({label})")
        print()
    return 0


def checklist():
    rows = collect()
    out = []
    out.append("# Icon-Checklist — Shopping List Card\n")
    out.append("> Quelle: Flaticon (SVG 512×512, viewBox 0 0 512 512). "
               "Datei exakt wie angegeben benennen und in "
               "`icons-staging/items/` bzw. `icons-staging/categories/` legen.\n")
    out.append("> Eintrag mit „(Auto-Kopie)“ muss NICHT manuell geladen werden — "
               "wird aus dem Original erzeugt, sobald dieses vorliegt.\n")
    out.append("> Stand aktualisieren: `python3 tools/check_icons.py --checklist`.\n")
    present_count = sum(1 for r in rows if r[6])
    out.append(f"\n**Fortschritt: {present_count}/{len(rows)}**\n")
    for cat in CAT_ORDER + ["categories"]:
        bucket = [r for r in rows if r[3] == cat]
        if not bucket:
            continue
        name = CATEGORIES[cat] if cat in CATEGORIES else "Kategorie-Icons"
        out.append(f"\n## {name}\n")
        out.append("| ☐ | Zieldatei | Flaticon-Suche | Status |")
        out.append("|---|---|---|---|")
        for fn, label, query, _, copy_of, kind, p in sorted(bucket):
            mark = "✅" if p else ("↪ Auto-Kopie" if copy_of else "☐ fehlt")
            extra = f" (Auto-Kopie von `{copy_of}`)" if copy_of else ""
            out.append(f"| {mark} | `{fn}` | `{query}` | {label}{extra} |")
    path = os.path.join(STAGING, "CHECKLIST.md")
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(out) + "\n")
    print(f"Checklist geschrieben: {path}")
    return 0


def main():
    args = set(sys.argv[1:])
    if not args or "--report" in args:
        report()
    if "--checklist" in args or "--all" in args:
        checklist()
    if "--json" in args:
        rows = collect()
        print(json.dumps([{"file": r[0], "label": r[1], "query": r[2], "cat": r[3],
                           "copy_of": r[4], "kind": r[5], "present": r[6]}
                          for r in rows], ensure_ascii=False, indent=2))


if __name__ == "__main__":
    sys.exit(main() or 0)