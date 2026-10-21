"""Gemeinsame Test-Hilfen fuer die Backend-Tests.

Der AppDaemon-Hass-Plugin wird hier gestubbt, damit die Tests ohne laufendes
AppDaemon laufen. Die Stubs bilden die echte Semantik nach - insbesondere
call_service, das in AppDaemon EINEN "<domain>/<service>"-String erwartet:

    self.call_service("input_text/set_value", entity_id=..., value="")

Zwei positionale Argumente (self.call_service("input_text", "set_value"))
scheitern mit "not enough values to unpack (expected 2, got 1)". Genau das
war der Bug in v2.5.6, der dazu fuehrte, dass der Command-Input nicht
geleert wurde und jeder zweite Befehl still verworfen wurde.
"""
import json
import os
import sys
import types
import uuid

import pytest

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APPS_DIR = os.path.join(REPO_ROOT, "apps")
CATALOG_PATH = os.path.join(APPS_DIR, "artikel_katalog.json")


def _install_appdaemon_stub():
    """Stubbt appdaemon.plugins.hass.hassapi, falls AppDaemon nicht da ist."""
    try:
        import appdaemon.plugins.hass.hassapi  # noqa: F401
        return
    except ImportError:
        pass

    mod = types.ModuleType("appdaemon.plugins.hass.hassapi")

    class Hass:
        pass

    mod.Hass = Hass
    for name in ("appdaemon", "appdaemon.plugins", "appdaemon.plugins.hass"):
        sys.modules.setdefault(name, types.ModuleType(name))
    sys.modules["appdaemon.plugins.hass.hassapi"] = mod


_install_appdaemon_stub()
if APPS_DIR not in sys.path:
    sys.path.insert(0, APPS_DIR)

import einkaufsliste_backend as backend  # noqa: E402


class FakeBackend(backend.EinkaufslisteBackend):
    """Backend-Instanz ohne HA-Anbindung, mit Aufzeichnung der Aufrufe."""

    def __init__(self, data_dir=None):
        self._app_dir = APPS_DIR
        self._data_dir = data_dir or self._temp_dir()
        self._catalog_path = CATALOG_PATH
        self._list_path = os.path.join(self._data_dir, "einkaufsliste.json")
        self._items = []
        self._catalog = {"categories": backend.CATEGORIES_FALLBACK,
                         "artikel": [], "version": "fallback"}
        self._catalog_version = "fallback"
        self._catalog_entry_cache = {}
        self._load_catalog()
        self._load_list()
        # Aufzeichnungen
        self.published = []
        self.services = []
        self.logs = []
        # Der aktuelle Entity-Wert des Command-Kanals und die Befehle, die
        # HA wegen eines unveraenderten Werts verworfen haette.
        self._input_value = None
        self.dropped = []

    @staticmethod
    def _temp_dir():
        import tempfile
        return tempfile.mkdtemp(prefix="slc-test-")

    # --- AppDaemon-Interface ------------------------------------------------

    def set_state(self, entity_id, state=None, attributes=None):
        self.published.append({"entity_id": entity_id, "state": state,
                               "attributes": attributes})

    def call_service(self, service, **kwargs):
        """Wie AppDaemon: EIN Service-String, sonst TypeError."""
        if not isinstance(service, str) or "/" not in service:
            raise ValueError("not enough values to unpack (expected 2, got 1)")
        domain, name = service.split("/", 1)
        self.services.append({"domain": domain, "service": name, "data": kwargs})
        # set_value auf dem Command-Kanal setzt den Entity-Wert.
        if domain == "input_text" and name == "set_value":
            self._input_value = kwargs.get("value")
        return None

    def log(self, message, level="INFO", **kwargs):
        self.logs.append((level, str(message)))

    def get_now(self):
        import datetime
        return datetime.datetime.now(datetime.timezone.utc)

    # --- Testhilfen ---------------------------------------------------------

    def command(self, raw):
        """Schreibt einen Roh-String in den Command-Kanal.

        Simuliert Home Assistants Zustandslogik: der Entity-Wert wird nur
        uebernommen, wenn er sich aendert. Bei gleichem Wert feuert kein
        state_changed, und AppDaemons listen_state laeuft nicht - der
        Befehl ginge dann still verloren.

        Genau das war der Bug aus v2.5.6: der Input wurde nicht geleert,
        der naechste identische Befehl erzeugte denselben Wert und wurde
        von HA nie zugestellt.
        """
        value = (raw or "").strip()
        if not value:
            return
        if value == self._input_value:
            self.dropped.append(value)
            return
        self._input_value = value
        self._on_command_input("input_text.einkaufsliste_command", None, None,
                               raw)

    def command_json(self, obj):
        self.command(json.dumps(obj, ensure_ascii=False))

    def item(self, uid):
        for it in self._items:
            if it.get("uid") == uid:
                return it
        return None

    def summary_of(self, uid):
        it = self.item(uid)
        return it.get("summary") if it else None


@pytest.fixture
def bk():
    """Frische Backend-Instanz pro Test."""
    return FakeBackend()


@pytest.fixture
def shared_bk(tmp_path):
    """Backend-Instanz mit persistentem data_dir (fuer Persistenztests)."""
    return FakeBackend(data_dir=str(tmp_path))


# --------------------------------------------------------------------
# Card-Tests (Web Component im echten Chromium)
# --------------------------------------------------------------------

CARD_PATH = os.path.join(REPO_ROOT, "shopping-list-card.js")


@pytest.fixture(scope="session")
def card_source():
    with open(CARD_PATH, encoding="utf-8") as fh:
        return fh.read()


@pytest.fixture(scope="session")
def chromium_path():
    """Pfad zum Playwright-Chromium, falls installiert."""
    import glob
    patterns = [
        os.path.expanduser("~/.cache/ms-playwright/chromium-*/chrome-linux64/chrome"),
        os.path.expanduser("~/.cache/ms-playwright/chromium-*/chrome-linux/chrome"),
    ]
    for pattern in patterns:
        hits = sorted(glob.glob(pattern))
        if hits:
            return hits[-1]
    return None


@pytest.fixture(scope="session")
def browser(chromium_path):
    """Chromium-Instanz fuer die DOM-Tests (session-scoped, ist teuer)."""
    if chromium_path is None:
        pytest.skip("Playwright-Chromium ist nicht installiert "
                    "(pip install playwright && playwright install chromium)")
    from playwright.sync_api import sync_playwright
    with sync_playwright() as pw:
        browser = pw.chromium.launch(
            headless=True,
            executable_path=chromium_path,
            args=["--no-sandbox", "--disable-dev-shm-usage"],
        )
        yield browser
        browser.close()


@pytest.fixture
def page(browser, card_source):
    """Leere Seite mit der Card geladen, aber ohne hass-Daten."""
    ctx = browser.new_context(viewport={"width": 1000, "height": 1600})
    page = ctx.new_page()
    page.set_content(
        "<!DOCTYPE html><html><body>"
        "<shopping-list-card id='card'></shopping-list-card>"
        f"<script>{card_source}</script>"
        "</body></html>"
    )
    yield page
    ctx.close()


def make_items():
    """Beispielartikel fuer die Card-Tests."""
    return [
        {"uid": "u1", "summary": "Milch", "status": "needs_action",
         "quantity": 1, "category": "Milchprodukte & Eier", "icon": "1F95B",
         "list": "standard"},
        {"uid": "u2", "summary": "Brot", "status": "needs_action",
         "quantity": 2, "category": "Brot & Backwaren", "icon": "1F35E",
         "list": "standard"},
        {"uid": "u3", "summary": "Käse", "status": "needs_action",
         "quantity": 1, "category": "Milchprodukte & Eier", "icon": "1F9C0",
         "list": "standard"},
    ]


def attach_hass(page, items=None, state="3"):
    """Setzt hass auf der Card und zeichnet die callService-Aufrufe auf.

    Rueckgabe: die Liste window.__sent im Browser.
    """
    page.evaluate(
        """([items, state]) => {
            window.__sent = [];
            const card = document.getElementById('card');
            card.setConfig({ entity: 'sensor.einkaufsliste_backend',
                             title: 'Test', list: 'standard' });
            card.hass = {
                states: { 'sensor.einkaufsliste_backend': {
                    state: state, attributes: { items: items } } },
                callService: (domain, service, data) => {
                    window.__sent.push({ domain: domain, service: service,
                                         value: data && data.value });
                    return Promise.resolve();
                },
                connection: {
                    subscribeMessage: () => Promise.resolve(() => {}),
                    subscribeEvents: () => Promise.resolve(() => {}),
                },
            };
        }""",
        [items if items is not None else make_items(), state],
    )
    page.wait_for_timeout(800)


def sent_commands(page, kind=None):
    """Die aufgezeichneten Aufrufe, optional gefiltert nach Event-Art."""
    sent = page.evaluate("() => window.__sent")
    if kind is None:
        return sent
    return [s for s in sent if kind in str(s.get("value") or "")]
