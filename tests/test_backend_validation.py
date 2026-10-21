"""Tests fuer die Eingabevalidierung des Backends.

Der Command-Kanal (input_text.einkaufsliste_command) ist von jedem HA-User
beschreibbar. Jedes Feld muss deshalb geprueft werden, bevor es in die
persistierte Liste wandert.
"""
import json

import pytest

from conftest import backend


# --------------------------------------------------------------------- Icons

@pytest.mark.parametrize("raw,expected", [
    ("1F34E", "1F34E"),          # gueltiger OpenMoji-Codepoint
    ("1f34e", "1F34E"),          # Kleinschreibung wird normalisiert
    ("1F9C0", "1F9C0"),
    (None, backend.FALLBACK_ICON),
    ("", backend.FALLBACK_ICON),
    ("http://evil.example/x.svg", backend.FALLBACK_ICON),
    ("https://evil.example/x.svg", backend.FALLBACK_ICON),
    ("/etc/passwd", backend.FALLBACK_ICON),
    ("../../secret.svg", backend.FALLBACK_ICON),
    ("<script>alert(1)</script>", backend.FALLBACK_ICON),
    ("1F34E; DROP TABLE", backend.FALLBACK_ICON),
    ({"nested": 1}, backend.FALLBACK_ICON),
    (["1F34E"], backend.FALLBACK_ICON),
    (True, backend.FALLBACK_ICON),
])
def test_clean_icon(bk, raw, expected):
    assert bk._clean_icon(raw) == expected


def test_icon_never_becomes_a_url(bk):
    """Das Card laedt ein Backend-Icon und inline-t es als SVG. Eine URL
    wuerde ein fremdes Dokument in die Seite einbetten (Stored XSS)."""
    for raw in ("http://evil/x.svg", "//evil/x.svg", "data:image/svg+xml,x"):
        result = str(bk._clean_icon(raw))
        assert not result.startswith("http")
        assert not result.startswith("//")
        assert not result.startswith("data:")


# ---------------------------------------------------------------------- List

@pytest.mark.parametrize("raw,expected", [
    ("standard", "standard"),
    (None, backend.DEFAULT_LIST),
    ("", "standard"),
    ("other", "standard"),          # nicht erlaubt
    ("../../etc", "standard"),
    ("Standard", "standard"),       # case-sensitiv: nicht erlaubt
    (123, "standard"),
    ({"a": 1}, "standard"),
])
def test_clean_list(bk, raw, expected):
    assert bk._clean_list(raw) == expected


def test_unknown_list_is_logged(bk):
    bk._clean_list("fremde-liste")
    assert any("unknown list" in msg for _, msg in bk.logs)


# ----------------------------------------------------------------- Quantity

@pytest.mark.parametrize("raw,expected", [
    (1, 1),
    (0, 0),                 # 0 ist erlaubt ("Menge leeren")
    ("3", 3),
    (None, 1),
    ("abc", 1),
    (float("inf"), 1),      # int(float('inf')) wirft OverflowError
    (float("nan"), 1),
    (2 ** 70, backend.MAX_QTY),
    (-5, 0),
    (True, 1),              # bool ist kein int fuer uns
    (False, 1),
])
def test_clean_qty(bk, raw, expected):
    assert bk._clean_qty(raw, 1) == expected


def test_qty_never_raises(bk):
    """Ein OverflowError wuerde den Handler abbrechen und die Aktion
    stillschweigend verwerfen."""
    for raw in (float("inf"), float("nan"), 10 ** 100, "x" * 100):
        assert isinstance(bk._clean_qty(raw, 1), int)


# ------------------------------------------------------------------- Summary

@pytest.mark.parametrize("raw,expected", [
    ("Milch", "Milch"),
    ("  Milch  ", "Milch"),
    ("Milch\nJoghurt", "Milch Joghurt"),   # Newline wird zu Leerzeichen
    ("Milch\tJoghurt", "Milch Joghurt"),
    ("Milch\x00Joghurt", "Milch Joghurt"),  # Control-Zeichen
    (["Milch"], ""),
    ({"a": 1}, ""),
    (None, ""),
    (123, ""),
])
def test_clean_summary(bk, raw, expected):
    assert bk._clean_summary(raw) == expected


def test_summary_is_bounded(bk):
    assert len(bk._clean_summary("x" * 500)) == backend.MAX_SUMMARY


# ----------------------------------------------------------------- Category

def test_clean_category_accepts_known(bk):
    name = bk._catalog["categories"][0]["name"]
    assert bk._clean_category(name) == name


def test_clean_category_rejects_unknown(bk):
    assert bk._clean_category("Evil Category") is None
    assert bk._clean_category({"a": 1}) is None
    assert bk._clean_category(None) is None


def test_clean_category_rejects_prototype_keys(bk):
    """__proto__ als Kategorie darf nicht in die Persistenz gelangen."""
    for key in ("__proto__", "constructor", "prototype"):
        assert bk._clean_category(key) is None


# ------------------------------------------------------------------ No-Dedup

def test_no_dedup_needs_explicit_true(bk):
    """Der String "false" ist in Python truthy - mit einer truthy-Pruefung
    wuerde er den Dedup deaktivieren, obwohl der Client das Gegenteil
    meint. Nur ein echtes True schaltet den Dedup ab."""
    # "false" (String) -> Dedup bleibt AKTIV -> der zweite Add merged
    bk.command_json({"e": "add", "d": {"s": "Milch", "q": 1}})
    bk.command_json({"e": "add", "d": {"s": "Milch", "q": 1, "no_dedup": "false"}})
    milch = [i for i in bk._items if i["summary"] == "Milch"]
    assert len(milch) == 1, "der String 'false' darf den Dedup nicht deaktivieren"
    assert milch[0]["quantity"] == 2, "der zweite Add muss gemerged haben"

    # Ein echtes True schaltet den Dedup ab -> zwei getrennte Artikel
    bk.command_json({"e": "add", "d": {"s": "Brot", "q": 1}})
    bk.command_json({"e": "add", "d": {"s": "Brot", "q": 1, "no_dedup": True}})
    brot = [i for i in bk._items if i["summary"] == "Brot"]
    assert len(brot) == 2, "no_dedup=True muss den Merge verhindern"
