"""
AppDaemon backend for the Shopping-List-Card (v2.0.0).

Replaces the native HA `todo` shopping_list integration as the source of truth
for the shopping list. The card talks to this backend exclusively via HA events
(`einkaufsliste_*`) and reads the list state from a single sensor:

    sensor.einkaufsliste_backend
        state:       number of active (needs_action) items
        attributes:
            items:            JSON array of all items (active + completed)
            catalog_version:  hash of the loaded artikel_katalog.json
            last_updated:     ISO timestamp of last mutation
            friendly_name:   "Einkaufsliste"

Why AppDaemon instead of `todo.*` services:
  - `todo.remove_item` matches by summary string (Banane/Bananen confusion);
    here we remove strictly by uid.
  - `todo.remove_item` cannot delete completed items; here we can.
  - Auto-categorization & auto-dedup run server-side (persisted, shared across
    all devices) instead of per-device in the card.
  - AppDaemon is single-threaded per app -> no race conditions on concurrent
    multi-device writes.

Events handled:
    einkaufsliste_add             {summary, quantity?, list?, no_dedup?}
    einkaufsliste_remove          {uid}
    einkaufsliste_toggle          {uid}
    einkaufsliste_update          {uid, summary?, quantity?, category?, icon?}
    einkaufsliste_clear_completed {list?}
    einkaufsliste_clear_all       {list?}
    einkaufsliste_import          {from_entity?}   (one-shot migration)
    einkaufsliste_reload_catalog  {}                (reload artikel_katalog.json)

Persistence:
    einkaufsliste.json     - the list itself (survives restarts)
    artikel_katalog.json   - editable catalog (categories + article aliases +
                             icons); edit via Studio Code Server, then send
                             einkaufsliste_reload_catalog or restart AppDaemon.
"""

import appdaemon.plugins.hass.hassapi as hass
import json
import os
import re
import tempfile
import uuid


SENSOR_ID = "sensor.einkaufsliste_backend"
DEFAULT_LIST = "standard"
# OpenMoji HEX codepoints + category colors, aligned with artikel_katalog.json.
# Used only when the catalog file is missing/corrupt; the real catalog is the
# source of truth for category names, icons, and colors.
CATEGORIES_FALLBACK = [
    {"id": "obst_gemuese", "name": "Obst & Gemüse", "icon": "1F955", "color": "#E67E22"},
    {"id": "brot_backwaren", "name": "Brot & Backwaren", "icon": "1F35E", "color": "#D35400"},
    {"id": "milch_eier", "name": "Milchprodukte & Eier", "icon": "1F9C0", "color": "#F39C12"},
    {"id": "fleisch_fisch", "name": "Fleisch & Fisch", "icon": "1F357", "color": "#E74C3C"},
    {"id": "trockenwaren", "name": "Trockenwaren", "icon": "1F4E6", "color": "#8E44AD"},
    {"id": "tiefkuehlprodukte", "name": "Tiefkühlprodukte", "icon": "2744", "color": "#3498DB"},
    {"id": "getraenke", "name": "Getränke", "icon": "1F964", "color": "#1ABC9C"},
    {"id": "haushalt_hygiene", "name": "Haushalt & Hygiene", "icon": "1F9F9", "color": "#9B59B6"},
    {"id": "sonstiges", "name": "Sonstiges", "icon": "1F6D2", "color": "#7F8C8D"},
]
FALLBACK_ICON = "1F6D2"  # OpenMoji shopping cart — used for unknown articles


class EinkaufslisteBackend(hass.Hass):

    # ------------------------------------------------------------------ init

    def initialize(self):
        self._app_dir = self._resolve_app_dir()
        self._data_dir = self._resolve_data_dir()
        # The catalog is hand-edited config: it rides along next to the app
        # (editable, redeployable from the repo). The list is generated user
        # data: it lives in a dedicated dir that survives any app-dir disruption.
        self._catalog_path = os.path.join(self._app_dir, "artikel_katalog.json")
        self._list_path = os.path.join(self._data_dir, "einkaufsliste.json")
        self._items = []
        self._catalog = {"categories": CATEGORIES_FALLBACK, "artikel": [], "version": "fallback"}
        self._catalog_version = "fallback"

        self._load_catalog()
        self._load_list()

        self.listen_event(self._on_add, "einkaufsliste_add")
        self.listen_event(self._on_remove, "einkaufsliste_remove")
        self.listen_event(self._on_toggle, "einkaufsliste_toggle")
        self.listen_event(self._on_update, "einkaufsliste_update")
        self.listen_event(self._on_clear_completed, "einkaufsliste_clear_completed")
        self.listen_event(self._on_clear_all, "einkaufsliste_clear_all")
        self.listen_event(self._on_import, "einkaufsliste_import")
        self.listen_event(self._on_reload_catalog, "einkaufsliste_reload_catalog")

        self._publish()
        self.log("Einkaufsliste backend started (%d items, catalog %s)"
                 % (len(self._items), self._catalog_version))

    def _resolve_app_dir(self):
        """Where the app source + editable catalog live (rides along on deploy)."""
        try:
            d = os.path.dirname(os.path.abspath(__file__))
            if os.path.isdir(d):
                return d
        except Exception:
            pass
        d = getattr(self, "app_dir", None)
        if d and os.path.isdir(d):
            return d
        return "/config"

    def _resolve_data_dir(self):
        """Where the generated list (einkaufsliste.json) lives.

        This is the source of truth and must survive any disruption of the app
        source tree (reinstall, git pull, HACS re-fetch). Prefer, in order:
          1. an explicit `data_dir` override from apps.yaml,
          2. a dedicated app data dir under /config,
          3. AppDaemon's own app_dir as a last resort.
        """
        dedicated = "/config/appdaemon_data/einkaufsliste"
        candidates = []
        if hasattr(self, "args"):
            candidates.append(self.args.get("data_dir"))
        candidates.append(dedicated)
        candidates.append(getattr(self, "app_dir", None))
        for c in candidates:
            if c and os.path.isdir(c):
                return c
        # nothing exists yet — create the dedicated dir so the first save works
        try:
            os.makedirs(dedicated, exist_ok=True)
            return dedicated
        except OSError:
            return "/config"

    # ------------------------------------------------------------- persistence

    def _load_list(self):
        try:
            with open(self._list_path, "r", encoding="utf-8") as fh:
                data = json.load(fh)
            self._items = data.get("items", [])
        except FileNotFoundError:
            self._items = []
        except json.JSONDecodeError as e:
            # Archive the corrupt file aside so the user can diagnose/recover
            # before the next save truncates it.
            self.log("List JSON corrupt (%s); archiving" % e, level="ERROR")
            try:
                os.replace(self._list_path, self._list_path + ".corrupt")
            except OSError:
                pass
            self._items = []
        except Exception as e:
            self.log("List load failed (%s); starting empty" % e, level="WARNING")
            self._items = []

    def _save_list(self):
        """Atomic write: write to a temp sibling then os.replace into place.

        Truncating the live file in-place risks leaving the source of truth
        empty/partial if AppDaemon/HA is killed or the disk fills mid-write.
        os.replace is atomic on the same filesystem.
        """
        try:
            os.makedirs(self._data_dir, exist_ok=True)
            fd, tmp = tempfile.mkstemp(dir=self._data_dir, suffix=".tmp")
            with os.fdopen(fd, "w", encoding="utf-8") as fh:
                json.dump({"version": 1, "items": self._items},
                          fh, ensure_ascii=False, indent=2)
            os.replace(tmp, self._list_path)
        except Exception as e:
            self.log("List save failed: %s" % e, level="ERROR")

    def _load_catalog(self):
        try:
            with open(self._catalog_path, "r", encoding="utf-8") as fh:
                self._catalog = json.load(fh)
            if not self._catalog.get("categories"):
                self._catalog["categories"] = CATEGORIES_FALLBACK
            self._catalog_version = self._catalog.get("version", "unknown")
        except FileNotFoundError:
            self._catalog = {"categories": CATEGORIES_FALLBACK, "artikel": [], "version": "fallback"}
            self._catalog_version = "fallback"
        except Exception as e:
            self.log("Catalog load failed (%s); using fallback" % e, level="WARNING")
            self._catalog = {"categories": CATEGORIES_FALLBACK, "artikel": [], "version": "fallback"}
            self._catalog_version = "fallback"

    # ------------------------------------------------------------- cataloging

    _NORMALIZE_MAP = str.maketrans({"ä": "a", "ö": "o", "ü": "u", "ß": "ss"})

    @classmethod
    def _norm(cls, s):
        if not s:
            return ""
        s = s.lower().translate(cls._NORMALIZE_MAP)
        s = re.sub(r"[^a-z0-9]+", " ", s)
        return s.strip()

    @classmethod
    def _singularize(cls, s):
        """Crude German singularization for dedup matching only.

        Order matters: longer suffixes first so "bananen" -> "banan" (en)
        rather than "banane" (n). "banane" -> "banan" (e). Both collapse to
        the same key, so singular/plural duplicates merge.
        """
        n = cls._norm(s)
        for suf in ("en", "n", "er", "e", "s"):
            # require a stem of >=3 chars after stripping so short words like
            # "eis" (-> "ei") don't collapse into "ei" and merge with eggs.
            if n.endswith(suf) and len(n) - len(suf) >= 3:
                n = n[: -len(suf)]
                break
        return n

    def _catalog_entry_for(self, summary):
        """Return matching catalog article entry (dict) or None."""
        if not summary:
            return None
        target = self._norm(summary)
        for art in self._catalog.get("artikel", []):
            names = [art.get("name", "")] + list(art.get("aliases", []))
            for nm in names:
                if self._norm(nm) == target:
                    return art
        # fuzzy: target contains a catalog name or vice-versa. Guard against
        # short words (e.g. "ei" matching "speise"/"reis"/"seife") by requiring
        # both sides to be at least 4 chars before substring matching is allowed.
        for art in self._catalog.get("artikel", []):
            names = [art.get("name", "")] + list(art.get("aliases", []))
            for nm in names:
                cn = self._norm(nm)
                if (len(cn) >= 4 and len(target) >= 4
                        and (cn in target or target in cn)):
                    return art
        return None

    def _category_name(self, cat_id):
        for c in self._catalog.get("categories", []):
            if c.get("id") == cat_id:
                return c.get("name", cat_id)
        return cat_id or "Sonstiges"

    def _categorize(self, summary):
        """Return (category_name, icon, cat_id) for a summary."""
        entry = self._catalog_entry_for(summary)
        if entry:
            cat_id = entry.get("category", "sonstiges")
            return (self._category_name(cat_id),
                    entry.get("icon", FALLBACK_ICON),
                    cat_id)
        return ("Sonstiges", FALLBACK_ICON, "sonstiges")

    # ------------------------------------------------------------------ helpers

    def _find_dedup_target(self, summary, list_id):
        """Find an existing active item to merge into, or None.

        Matches by normalized singular form. Honors per-catalog `dedup: false`
        (article-level) -> never merges that article.
        """
        entry = self._catalog_entry_for(summary)
        if entry and entry.get("dedup") is False:
            return None
        key = self._singularize(summary)
        for it in self._items:
            if it.get("list", DEFAULT_LIST) != list_id:
                continue
            if it.get("status") != "needs_action":
                continue
            if self._singularize(it.get("summary", "")) == key:
                return it
        return None

    def _now_iso(self):
        # AppDaemon time API — respects the simulated clock in test harnesses
        # and HA's configured timezone, unlike stdlib datetime.now().
        return self.get_now().isoformat()

    def _new_uid(self):
        return uuid.uuid4().hex

    @staticmethod
    def _coerce_qty(raw, default=1):
        """Parse a quantity, allowing 0. None -> default; bad values -> default."""
        if raw is None:
            return default
        try:
            return max(0, int(raw))
        except (TypeError, ValueError):
            return default

    @staticmethod
    def _extract_todo_items(resp, entity_id):
        """Pull the items list out of a todo/get_items response.

        AppDaemon v4.5+ wraps HA's response as {"result": {"response": {eid: {...}}}}.
        Older/synthetic paths may hand back the flat HA response {eid: {...}}.
        Accept either, and also a bare list, so migration survives version drift.
        """
        if not resp:
            return []
        if isinstance(resp, list):
            return resp
        if isinstance(resp, dict):
            # wrapped form
            inner = resp.get("result", {})
            if isinstance(inner, dict) and "response" in inner:
                resp = inner["response"]
            # flat HA form: {entity_id: {"items": [...]}}
            node = resp.get(entity_id)
            if isinstance(node, dict):
                return node.get("items", [])
            # some versions return {"items": [...]} directly
            if "items" in resp:
                return resp.get("items", [])
        return []

    def _publish(self):
        active = sum(1 for it in self._items if it.get("status") == "needs_action")
        attrs = {
            "items": self._items,
            "catalog_version": self._catalog_version,
            "last_updated": self._now_iso(),
            "friendly_name": "Einkaufsliste",
            "unit_of_measurement": "Artikel",
            "state_class": "measurement",
            "icon": "mdi:cart-outline",
        }
        self.set_state(SENSOR_ID, state=str(active), attributes=attrs)

    # ------------------------------------------------------------------ events

    def _on_add(self, event_name, data, **kwargs):
        data = data or {}
        summary = (data.get("summary") or "").strip()
        if not summary:
            self.log("add ignored: empty summary", level="WARNING")
            return
        list_id = data.get("list") or DEFAULT_LIST
        qty = self._coerce_qty(data.get("quantity"), 1)
        no_dedup = bool(data.get("no_dedup"))

        if not no_dedup:
            target = self._find_dedup_target(summary, list_id)
            if target is not None:
                target["quantity"] = int(target.get("quantity", 1)) + qty
                self._save_list()
                self._publish()
                self.log("add (merged into %s, qty=%d)"
                         % (target.get("summary"), target.get("quantity")))
                return

        cat_name, icon, _ = self._categorize(summary)
        item = {
            "uid": self._new_uid(),
            "summary": summary,
            "status": "needs_action",
            "category": cat_name,
            "icon": icon,
            "quantity": qty,
            "list": list_id,
            "added_at": self._now_iso(),
            "completed_at": None,
        }
        self._items.append(item)
        self._save_list()
        self._publish()
        self.log("add: %s (qty=%d, cat=%s)" % (summary, qty, cat_name))

    def _on_remove(self, event_name, data, **kwargs):
        data = data or {}
        uid = data.get("uid")
        if not uid:
            self.log("remove ignored: no uid", level="WARNING")
            return
        before = len(self._items)
        self._items = [it for it in self._items if it.get("uid") != uid]
        if len(self._items) == before:
            self.log("remove: uid %s not found" % uid, level="INFO")
            return
        self._save_list()
        self._publish()
        self.log("remove: %s" % uid)

    def _on_toggle(self, event_name, data, **kwargs):
        data = data or {}
        uid = data.get("uid")
        if not uid:
            return
        for it in self._items:
            if it.get("uid") == uid:
                if it.get("status") == "needs_action":
                    it["status"] = "completed"
                    it["completed_at"] = self._now_iso()
                else:
                    it["status"] = "needs_action"
                    it["completed_at"] = None
                self._save_list()
                self._publish()
                self.log("toggle: %s -> %s" % (uid, it["status"]))
                return
        self.log("toggle: uid %s not found" % uid, level="INFO")

    def _on_update(self, event_name, data, **kwargs):
        data = data or {}
        uid = data.get("uid")
        if not uid:
            return
        for it in self._items:
            if it.get("uid") != uid:
                continue
            if "summary" in data and data["summary"]:
                it["summary"] = data["summary"].strip()
                cat_name, icon, _ = self._categorize(it["summary"])
                # re-categorize unless caller pinned category/icon
                if "category" not in data:
                    it["category"] = cat_name
                if "icon" not in data:
                    it["icon"] = icon
            if "quantity" in data:
                # allow 0 (clear quantity); keep existing on None/bad input
                it["quantity"] = self._coerce_qty(data["quantity"], it.get("quantity", 1))
            if "category" in data:
                it["category"] = data["category"]
            if "icon" in data:
                it["icon"] = data["icon"]
            self._save_list()
            self._publish()
            self.log("update: %s" % uid)
            return
        self.log("update: uid %s not found" % uid, level="INFO")

    def _on_clear_completed(self, event_name, data, **kwargs):
        data = data or {}
        list_id = data.get("list")
        before = len(self._items)
        self._items = [
            it for it in self._items
            if not (it.get("status") == "completed"
                    and (list_id is None or it.get("list", DEFAULT_LIST) == list_id))
        ]
        removed = before - len(self._items)
        if removed == 0:
            self.log("clear_completed: nothing to remove")
            return
        self._save_list()
        self._publish()
        self.log("clear_completed: removed %d" % removed)

    def _on_clear_all(self, event_name, data, **kwargs):
        data = data or {}
        list_id = data.get("list")
        before = len(self._items)
        if list_id is None:
            self._items = []
        else:
            self._items = [it for it in self._items
                           if it.get("list", DEFAULT_LIST) != list_id]
        if len(self._items) == before:
            self.log("clear_all: already empty")
            return
        self._save_list()
        self._publish()
        self.log("clear_all (list=%s)" % list_id)

    def _on_reload_catalog(self, event_name, data, **kwargs):
        data = data or {}
        self._load_catalog()
        # re-categorize existing items so they pick up catalog changes
        for it in self._items:
            cat_name, icon, _ = self._categorize(it.get("summary", ""))
            it["category"] = cat_name
            it["icon"] = icon
        self._save_list()
        self._publish()
        self.log("catalog reloaded (%s), re-categorized %d items"
                 % (self._catalog_version, len(self._items)))

    def _on_import(self, event_name, data, **kwargs):
        """One-shot migration from a native todo entity (default todo.einkaufsliste)."""
        data = data or {}
        from_entity = data.get("from_entity") or "todo.einkaufsliste"
        try:
            resp = self.call_service("todo/get_items",
                                     entity_id=from_entity,
                                     return_response=True)
        except Exception as e:
            self.log("import: get_items failed: %s" % e, level="ERROR")
            return
        items = self._extract_todo_items(resp, from_entity)
        imported = 0
        for src in items:
            summary = (src.get("summary") or "").strip()
            if not summary:
                continue
            # skip if uid already present (idempotent re-import)
            existing_uid = src.get("uid")
            if existing_uid and any(it.get("uid") == existing_uid for it in self._items):
                continue
            cat_name, icon, _ = self._categorize(summary)
            self._items.append({
                "uid": existing_uid or self._new_uid(),
                "summary": summary,
                "status": src.get("status", "needs_action"),
                "category": cat_name,
                "icon": icon,
                "quantity": 1,
                "list": DEFAULT_LIST,
                "added_at": self._now_iso(),
                "completed_at": src.get("completed"),
            })
            imported += 1
        self._save_list()
        self._publish()
        self.log("import: %d items from %s" % (imported, from_entity))