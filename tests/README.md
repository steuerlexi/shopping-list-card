# Tests

Automatisierte Tests für die Karte (`shopping-list-card.js`) und das
AppDaemon-Backend (`apps/einkaufsliste_backend.py`).

## Ausführen

```bash
# Einmalig
python3 -m venv .venv
.venv/bin/pip install -r tests/requirements.txt
.venv/bin/python -m playwright install chromium

# Alle Tests
.venv/bin/python -m pytest tests/ -v

# Nur Backend / nur Card
.venv/bin/python -m pytest tests/test_backend_*.py -v
.venv/bin/python -m pytest tests/test_card_*.py -v
```

## Aufbau

| Datei | Prüft |
|---|---|
| `conftest.py` | Fixtures: `FakeBackend` (AppDaemon-Stub), `page` (Card im echten Chromium), `attach_hass`, `bk`, `shared_bk` |
| `test_backend_validation.py` | Eingabevalidierung: Icons, Listen, Mengen, Artikelnamen, Kategorien |
| `test_backend_commands.py` | Command-Kanal: Wire-Format, Input-Leerung, Idempotenz, Robustheit gegen kaputte Payloads |
| `test_card_interaction.py` | Klick-Verhalten: ein Klick = ein Befehl, Long-Press, Tastatur, Payload-Länge |
| `test_card_security.py` | Stored XSS: SVG-Sanitizer, Icon-URLs, HTML-Injection, CSS-Scoping |
| `test_card_rendering.py` | Rendering: Kategorie-Toggle, Suchfilter, Fingerprint, Quantity 0 |
| `test_live.py` | Optional: gegen eine laufende HA-Instanz (`HA_URL` + `HA_TOKEN`) |

## Warum echtes Chromium statt jsdom

Die Karte ist ein Web Component ohne Build-Schritt. Playwright lädt die
unveränderte `shopping-list-card.js` in ein echtes Chromium und prüft das
tatsächliche Verhalten: Event-Delegation, Fokus, `content-visibility`,
Shadow-DOM-Grenzen. Ein DOM-Emulator bildet das nicht ab.

## Regressionen, die diese Tests abdecken

| Test | Verhindert |
|---|---|
| `test_two_identical_commands_are_both_executed` | Der Input-Kanal wird nach jedem Befehl geleert. Sonst erzeugt der nächste identische Befehl denselben Entity-Wert, HA feuert kein `state_changed` und der Befehl geht **still** verloren (Symptom: der zweite Klick auf denselben Artikel ging nicht). |
| `test_call_service_uses_a_single_service_string` | AppDaemon erwartet **einen** `"<domain>/<service>"`-String. Zwei positionale Argumente werfen `not enough values to unpack`. |
| `test_malformed_payload_does_not_crash` | Ein kaputter Befehl darf den Handler nicht abbrechen — sonst bleibt der Input dirty. |
| `test_category_collapse_works` | Der Chevron war in beiden Branches des Banner-Checks deklariert, aber im umgebenden Scope verwendet → `ReferenceError` bei jedem Klick. |
| `test_search_filter_survives_a_fast_path_render` | Der Tile-Index wurde im Fast-Path geleert, aber nicht neu aufgebaut → die Suche filterte nichts mehr. |
| `test_fingerprint_changes_with_the_category` | Die Kategorie war nicht Teil des Fingerprints → ein Katalog-Reload gruppierte die Liste nicht neu. |
| `test_quantity_zero_is_not_rewritten_to_one` | `item.quantity || 1` machte aus einer legitimen 0 eine 1. |
| `test_svg_parser_strips_event_handlers` | Gespeichertes XSS über das Backend-Feld `icon`. |
| `test_stylesheet_is_scoped_to_the_host` | Die Klassen der Karte formten andere Custom Cards um. |
| `test_payload_fits_the_input_text_limit` | HA verwirft Werte über 255 Zeichen **stillschweigend** — der Artikel ginge verloren. |

## Live-Test

`tests/test_live.py` läuft nur mit gesetzten Umgebungsvariablen und wird
sonst übersprungen:

```bash
HA_URL=http://192.168.1.147:8123 \
HA_TOKEN=<Long-Lived-Access-Token> \
    .venv/bin/python -m pytest tests/test_live.py -v
```

Der Test schickt echte Toggle-Befehle und prüft, dass jeder einzelne
ankommt. Er stellt den Ausgangszustand wieder her.
