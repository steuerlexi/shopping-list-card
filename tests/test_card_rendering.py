"""Tests fuer das Rendering und die Zustandsverwaltung der Card.

Regressionsschutz fuer die Befunde aus dem Code Review:
  - der Kategorie-Collapse war komplett kaputt ("chevron is not defined")
  - der Suchfilter starb nach jedem Backend-Echo (der Tile-Index wurde im
    Fast-Path geleert, aber nicht neu aufgebaut)
  - die Kategorie fehlte im Fingerprint, ein Katalog-Reload gruppierte die
    Liste nicht neu
  - quantity 0 wurde zu 1 umgeschrieben
"""
import pytest

from conftest import attach_hass, make_items


# ------------------------------------------------------------------ Render

def test_card_renders_tiles(page):
    attach_hass(page)
    assert page.locator(".sl-tile:not(.sl-ghost)").count() >= 3


def test_tiles_carry_their_state_in_data_attributes(page):
    attach_hass(page)
    status = page.locator('.sl-tile[data-uid="u1"]').first.get_attribute("data-status")
    assert status == "needs_action"


def test_quantity_is_rendered(page):
    attach_hass(page)
    qty = page.locator('.sl-tile[data-uid="u2"]').first.get_attribute("data-qty")
    assert qty == "2"


# --------------------------------------------------------- Kategorie-Toggle

def test_category_collapse_works(page):
    """Der Chevron war in beiden Branches des Banner-Checks deklariert, aber
    im umgebenden Scope verwendet -> bei jedem Klick ein ReferenceError."""
    attach_hass(page)
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    header = page.locator(".sl-header").first
    header.click()
    page.wait_for_timeout(300)
    assert errors == [], f"Fehler beim Klick: {errors}"
    assert header.get_attribute("aria-expanded") == "false"


def test_category_collapse_sets_the_dataset(page):
    """grid.dataset.collapsed steuert, ob dercollapsed Zustand nach einem
    Suchfilter-Roundtrip wiederhergestellt wird."""
    attach_hass(page)
    page.locator(".sl-header").first.click()
    page.wait_for_timeout(300)
    grid = page.locator(".sl-grid").first
    assert grid.get_attribute("data-collapsed") == "true"


def test_category_expand_works(page):
    attach_hass(page)
    header = page.locator(".sl-header").first
    header.click()
    page.wait_for_timeout(200)
    header.click()
    page.wait_for_timeout(200)
    assert header.get_attribute("aria-expanded") == "true"


# -------------------------------------------------------------- Suchfilter

def test_search_filter_narrows_the_tiles(page):
    attach_hass(page)
    page.evaluate(
        """() => document.getElementById('card')._filterVisible(
             document.querySelector('shopping-list-card'), 'milch')""")
    visible = page.locator('.sl-tile:not(.sl-ghost)').evaluate_all(
        "els => els.filter(e => e.style.display !== 'none').length")
    assert 0 < visible < 10


def test_search_filter_survives_a_fast_path_render(page):
    """REGRESSION: _render() leerte den Tile-Index, kehrte aber zurueck,
    ohne ihn neu aufzubauen. _filterVisible iteriert genau diesen Index -
    danach filterte die Suche nicht mehr."""
    attach_hass(page)
    # Einen Backend-Echo simulieren (gleicher Fingerprint -> Fast-Path)
    page.evaluate(
        """() => {
            const card = document.getElementById('card');
            card._items = card._items.map(i => ({...i}));
            card._fingerprint = card._fingerprintOf(card._items);
            card._lastFingerprint = card._fingerprint;
            card._render();
        }""")
    page.wait_for_timeout(300)
    # Der Index muss nach dem Fast-Path wieder gefuellt sein.
    index_len = page.evaluate(
        "() => document.getElementById('card')._tileIndex.length")
    assert index_len > 0, \
        "der Tile-Index ist nach dem Fast-Path leer - der Suchfilter waere blind"
    page.evaluate(
        """() => document.getElementById('card')._filterVisible(
             document.querySelector('shopping-list-card'), 'milch')""")
    visible = page.locator('.sl-tile:not(.sl-ghost)').evaluate_all(
        "els => els.filter(e => e.style.display !== 'none').length")
    assert 0 < visible < 10, "der Suchfilter hat den Tile-Index verloren"


def test_search_transliterates_umlauts(page):
    """'kaese' muss 'Käse' finden - die Auto-Kategorisierung normalisiert
    Umlaute ebenfalls."""
    attach_hass(page, items=[{
        "uid": "k1", "summary": "Käse", "status": "needs_action",
        "quantity": 1, "category": "Milchprodukte & Eier", "icon": "1F9C0",
        "list": "standard"}])
    page.evaluate(
        """() => document.getElementById('card')._filterVisible(
             document.querySelector('shopping-list-card'), 'kaese')""")
    visible = page.locator('.sl-tile:not(.sl-ghost)').evaluate_all(
        "els => els.filter(e => e.style.display !== 'none').length")
    assert visible == 1


# -------------------------------------------------------------- Fingerprint

def test_fingerprint_changes_with_the_category(page):
    """REGRESSION: die Kategorie war nicht Teil des Fingerprints. Ein
    Katalog-Reload verschiebt einen Artikel in eine andere Kategorie, ohne
    ein anderes Feld zu aendern - die Render-Pipeline bemerkte es nicht."""
    attach_hass(page)
    changed = page.evaluate(
        """() => {
            const card = document.getElementById('card');
            const a = card._fingerprintOf([{uid:'u1',status:'needs_action',
                summary:'Milch',quantity:1,icon:'1F95B',category:'A'}]);
            const b = card._fingerprintOf([{uid:'u1',status:'needs_action',
                summary:'Milch',quantity:1,icon:'1F95B',category:'B'}]);
            return a !== b;
        }""")
    assert changed


def test_fingerprint_is_stable_for_equal_items(page):
    attach_hass(page)
    same = page.evaluate(
        """() => {
            const card = document.getElementById('card');
            const items = [{uid:'u1',status:'needs_action',summary:'Milch',
                            quantity:1,icon:'1F95B',category:'A'}];
            return card._fingerprintOf(items) === card._fingerprintOf(items);
        }""")
    assert same


# -------------------------------------------------------------- Quantity 0

def test_quantity_zero_is_not_rewritten_to_one(page):
    """REGRESSION: 'item.quantity || 1' machte aus einer legitimen 0 eine 1.
    Das Backend erlaubt 0 ausdruecklich ('Menge leeren')."""
    attach_hass(page, items=[{
        "uid": "z1", "summary": "Null", "status": "needs_action",
        "quantity": 0, "category": "Sonstiges", "icon": "1F6D2",
        "list": "standard"}])
    qty = page.locator('.sl-tile[data-uid="z1"]').first.get_attribute("data-qty")
    assert qty == "0"


# ----------------------------------------------------------------- Struktur

def test_custom_element_registration_is_guarded(page):
    """Eine doppelte Registrierung wuerfe NotSupportedError und verhindert
    den customCards-Eintrag - die Card verschwinde aus dem Card-Picker."""
    registered = page.evaluate(
        "() => typeof customElements.get('shopping-list-card')")
    assert registered == "function"


def test_card_size_reflects_the_content(page):
    attach_hass(page)
    size = page.evaluate("() => document.getElementById('card').getCardSize()")
    assert size >= 1
