"""Tests fuer den Command-Kanal des Backends.

Regressionsschutz fuer den Bug aus v2.5.6/v2.5.7:

    Das Backend hat den input_text-Kanal nach jedem Befehl nicht geleert
    (falsche call_service-Signatur). Dadurch erzeugte der naechste Befehl
    mit identischem Payload denselben Entity-Wert. Home Assistant feuert
    bei gleichem Zustand nur noch state_reported, aber kein
    state_changed - AppDaemons listen_state lief also nicht mehr und der
    Befehl wurde still verworfen.

    Symptom: Der erste Klick auf einen Artikel hat funktioniert, der
    zweite Klick auf DENSELBEN Artikel nicht.
"""
import json

import pytest

from conftest import backend


# ------------------------------------------------------------ Wire-Format

def test_compact_format_is_understood(bk):
    """{"e": "add", "d": {"s": "Milch"}} - die komprimierte Form, mit der
    die Card Befehle sendet (passt in das 255-Zeichen-Limit)."""
    bk.command_json({"e": "add", "d": {"s": "Milch"}})
    assert len(bk._items) == 1
    assert bk._items[0]["summary"] == "Milch"


@pytest.mark.parametrize("raw,expected_event,expected_field", [
    ({"e": "add", "d": {"s": "Milch"}}, "einkaufsliste_add", "summary"),
    ({"e": "toggle", "d": {"u": "abc"}}, "einkaufsliste_toggle", "uid"),
    ({"e": "remove", "d": {"u": "abc"}}, "einkaufsliste_remove", "uid"),
    ({"e": "update", "d": {"u": "abc", "q": 3}}, "einkaufsliste_update", "quantity"),
    ({"e": "clear_completed", "d": {}}, "einkaufsliste_clear_completed", None),
    ({"e": "clear_all", "d": {}}, "einkaufsliste_clear_all", None),
])
def test_compact_field_names_expand(bk, raw, expected_event, expected_field):
    event_type, payload = backend.EinkaufslisteBackend._parse_command(raw)
    assert event_type == expected_event
    if expected_field:
        assert expected_field in payload


def test_verbose_format_still_works(bk):
    """Rueckwaertskompatibilitaet fuer handgeschriebene Events."""
    bk.command_json({"event": "einkaufsliste_add",
                     "data": {"summary": "Milch", "quantity": 1}})
    assert bk._items[0]["summary"] == "Milch"


def test_compact_and_verbose_are_equivalent(bk):
    bk.command_json({"e": "add", "d": {"s": "Milch", "q": 2}})
    compact = dict(bk._items[0])
    bk._items = []
    bk.command_json({"event": "einkaufsliste_add",
                     "data": {"summary": "Milch", "quantity": 2}})
    verbose = dict(bk._items[0])
    for key in ("summary", "quantity", "status", "category", "icon", "list"):
        assert compact[key] == verbose[key]


# --------------------------------------------------------- Input wird geleert

def test_input_is_cleared_after_every_command(bk):
    """DER Kern des Bugs: der Input muss nach jedem Befehl leer sein.

    Bleibt er stehen, faellt der naechste identische Befehl still durch."""
    bk.command_json({"e": "add", "d": {"s": "Milch"}})
    assert bk.services, "es wurde kein Service aufgerufen"
    last = bk.services[-1]
    assert last["domain"] == "input_text"
    assert last["service"] == "set_value"
    assert last["data"].get("value") == "", "der Input wurde nicht geleert"
    assert last["data"].get("entity_id") == backend.COMMAND_INPUT


def test_two_identical_commands_are_both_executed(bk):
    """Zwei identische Toggle-Befehle muessen beide ankommen.

    Das ist der eigentliche Symptom-Bug: der Input stand nach dem ersten
    Befehl noch auf dem gleichen String, der zweite Befehl erzeugte denselben
    Entity-Wert und wurde von HA nie zugestellt (kein state_changed).
    """
    bk.command_json({"e": "add", "d": {"s": "Milch"}})
    uid = bk._items[0]["uid"]

    bk.command_json({"e": "toggle", "d": {"u": uid}})
    assert bk.item(uid)["status"] == "completed"

    bk.command_json({"e": "toggle", "d": {"u": uid}})
    assert bk.item(uid)["status"] == "needs_action"

    bk.command_json({"e": "toggle", "d": {"u": uid}})
    assert bk.item(uid)["status"] == "completed"

    assert bk.dropped == [], "ein Befehl wurde von HA verworfen"


def test_repeated_identical_commands_are_never_dropped(bk):
    """10 identische Befehle - keiner darf verworfen werden.

    Der Harness simuliert HAs Zustandslogik: ein Befehl, dessen Entity-Wert
    unveraendert bleibt, loest kein state_changed aus und wird nie
    zugestellt (bk.dropped).
    """
    bk.command_json({"e": "add", "d": {"s": "Milch"}})
    uid = bk._items[0]["uid"]
    for i in range(10):
        bk.command_json({"e": "toggle", "d": {"u": uid}})
    assert bk.dropped == [], f"verworfene Befehle: {bk.dropped}"
    # 10 Toggles -> zurueck zum Ausgangszustand
    assert bk.item(uid)["status"] == "needs_action"


def test_call_service_uses_a_single_service_string(bk):
    """AppDaemon erwartet EINEN "<domain>/<service>"-String.

    Mit zwei positionalen Argumenten wirft der Aufruf
    "not enough values to unpack (expected 2, got 1)" - der Input bliebe
    dann stehen und jeder zweite Befehl ginge verloren.
    """
    bk.command_json({"e": "add", "d": {"s": "Milch"}})
    assert bk.services, "kein Service aufgerufen - der Input wurde nicht geleert"


# ------------------------------------------------------------- Robustheit

@pytest.mark.parametrize("raw", [
    "[1,2,3]",          # JSON-Array
    '"hello"',          # JSON-String
    "5",                # JSON-Zahl
    "null",             # JSON-null
    "true",             # JSON-Boolean
    "kein json",        # kaputtes JSON
])
def test_malformed_payload_does_not_crash(bk, raw):
    """Ein kaputter Befehl darf den Handler nicht abbrechen - sonst bleibt
    der Input dirty und der naechste Befehl geht verloren."""
    bk.command(raw)
    # Kein Absturz, kein Item, und der Input wurde geleert.
    assert bk._items == []
    assert bk.services, "der Input wurde nach dem Fehler nicht geleert"
    assert bk.services[-1]["data"].get("value") == ""


@pytest.mark.parametrize("raw", ["", "   "])
def test_empty_payload_is_ignored(bk, raw):
    """Ein leerer Input ist kein Befehl - es wird nichts getan und der
    Input bleibt unberuehrt (es gibt nichts zu leeren)."""
    bk.command(raw)
    assert bk._items == []
    assert bk.services == []


def test_unknown_event_is_ignored(bk):
    bk.command_json({"e": "gibtsnicht", "d": {}})
    assert bk._items == []
    assert any("unknown event" in msg for _, msg in bk.logs)


def test_payload_without_data_is_handled(bk):
    bk.command_json({"e": "add"})
    assert bk._items == []


def test_non_dict_data_is_handled(bk):
    bk.command_json({"e": "add", "d": "kein dict"})
    assert bk._items == []


# --------------------------------------------------------------- Idempotenz

def test_toggle_with_explicit_status_is_idempotent(bk):
    """Ein Toggle mit Zielstatus ist idempotent: ein Replay setzt denselben
    Status erneut, statt den Artikel zurueckzudrehen."""
    bk.command_json({"e": "add", "d": {"s": "Milch"}})
    uid = bk._items[0]["uid"]

    bk.command_json({"e": "toggle", "d": {"u": uid, "st": "completed"}})
    assert bk.item(uid)["status"] == "completed"

    bk.command_json({"e": "toggle", "d": {"u": uid, "st": "completed"}})
    assert bk.item(uid)["status"] == "completed"

    bk.command_json({"e": "toggle", "d": {"u": uid, "st": "needs_action"}})
    assert bk.item(uid)["status"] == "needs_action"


def test_toggle_without_status_flips(bk):
    """Ohne Zielstatus bleibt das Flip-Verhalten (Abwaertskompatibilitaet)."""
    bk.command_json({"e": "add", "d": {"s": "Milch"}})
    uid = bk._items[0]["uid"]
    bk.command_json({"e": "toggle", "d": {"u": uid}})
    assert bk.item(uid)["status"] == "completed"
    bk.command_json({"e": "toggle", "d": {"u": uid}})
    assert bk.item(uid)["status"] == "needs_action"


# ------------------------------------------------------------- Sicherheit

def test_add_to_foreign_list_is_refused(bk):
    bk.command_json({"e": "add", "d": {"s": "Wurst", "l": "fremde-liste"}})
    assert {i["list"] for i in bk._items} == {"standard"}


def test_clear_all_only_clears_own_list(bk):
    """Ohne "list" darf NICHT alles geloescht werden - nur die eigene
    Liste. Sonst koennte ein User die Listen anderer zerstoeren."""
    bk.command_json({"e": "add", "d": {"s": "Milch", "l": "standard"}})
    bk.command_json({"e": "add", "d": {"s": "Brot", "l": "standard"}})
    bk.command_json({"e": "clear_all", "d": {}})
    assert bk._items == []


def test_update_rejects_foreign_icon(bk):
    bk.command_json({"e": "add", "d": {"s": "Milch"}})
    uid = bk._items[0]["uid"]
    bk.command_json({"e": "update", "d": {"u": uid, "i": "http://evil/x.svg"}})
    assert not str(bk.item(uid)["icon"]).startswith("http")


def test_update_rejects_unknown_category(bk):
    bk.command_json({"e": "add", "d": {"s": "Milch"}})
    uid = bk._items[0]["uid"]
    before = bk.item(uid)["category"]
    bk.command_json({"e": "update", "d": {"u": uid, "c": "Evil"}})
    assert bk.item(uid)["category"] == before


def test_quantity_is_capped(bk):
    bk.command_json({"e": "add", "d": {"s": "Milch"}})
    uid = bk._items[0]["uid"]
    bk.command_json({"e": "update", "d": {"u": uid, "q": 10 ** 30}})
    assert bk.item(uid)["quantity"] == backend.MAX_QTY


# ------------------------------------------------------------- Persistenz

def test_list_survives_a_restart(shared_bk):
    shared_bk.command_json({"e": "add", "d": {"s": "Milch"}})
    shared_bk._save_list()
    from conftest import FakeBackend
    reloaded = FakeBackend(data_dir=shared_bk._data_dir)
    assert [i["summary"] for i in reloaded._items] == ["Milch"]


def test_no_temp_file_is_left_behind(shared_bk):
    import os
    shared_bk.command_json({"e": "add", "d": {"s": "Milch"}})
    shared_bk._save_list()
    leftovers = [f for f in os.listdir(shared_bk._data_dir) if f.endswith(".tmp")]
    assert leftovers == []
