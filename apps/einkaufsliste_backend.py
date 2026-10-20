"""
AppDaemon backend for the Shopping-List-Card (v2.5.6).

Replaces the native HA `todo` shopping_list integration as the source of truth
for the shopping list. The card talks to this backend exclusively via HA events
(`einkaufsliste_*`) and reads the list state from a single sensor:

    sensor.einkaufsliste_backend
        state:       number of active (needs_action) items
        attributes:
            items:            JSON array of all items (active + completed)
            catalog_version:  version string of the loaded artikel_katalog.json
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
    einkaufsliste_toggle          {uid, status?}   (status => idempotent)
    einkaufsliste_update          {uid, summary?, quantity?, category?, icon?}
    einkaufsliste_clear_completed {list?}
    einkaufsliste_clear_all       {list?}
    einkaufsliste_import          {from_entity?}   (one-shot migration)
    einkaufsliste_reload_catalog  {}                (reload artikel_katalog.json)

Command channel:
    The input_text entity `input_text.einkaufsliste_command` carries JSON
    commands so that non-admin users can drive the list (they may not use the
    WebSocket fire_event command). Two wire formats are accepted:

        compact:  {"e": "add", "d": {"s": "Milch", "q": 2}}
        verbose:  {"event": "einkaufsliste_add", "data": {"summary": "Milch"}}

    The compact form exists because Home Assistant caps input_text at 255
    characters and silently discards anything longer. Short field names and
    omitted defaults keep a long article name within the limit.

    Security: the channel is writable by every HA user, so every field is
    validated. A summary is a bounded string, a quantity a bounded int, an
    icon an OpenMoji codepoint (never a URL — the card would fetch and inline
    it), a category a known catalog entry, and a list an allowed list id.
    `clear_all` only ever clears the caller's own list.

Persistence:
    einkaufsliste.json     - the list itself (survives restarts)
    artikel_katalog.json   - editable catalog (categories + article aliases +
                             icons); edit via Studio Code Server, then send
                             einkaufsliste_reload_catalog or restart AppDaemon.
"""

import appdaemon.plugins.hass.hassapi as hass
import json
import math
import os
import re
import tempfile
import uuid


SENSOR_ID = "sensor.einkaufsliste_backend"
COMMAND_INPUT = "input_text.einkaufsliste_command"
DEFAULT_LIST = "standard"

# Input limits for the user-writable command channel. The card's JSON envelope
# costs ~90 characters, so MAX_SUMMARY leaves room inside the input_text's
# 255-character limit.
MAX_SUMMARY = 120
MAX_QTY = 999

# An icon is an OpenMoji codepoint (hex), never a URL or path. The card renders
# a backend-supplied icon by fetching and inlining it as SVG, so an unvalidated
# value would let any user inject a script into every user's dashboard.
ICON_RE = re.compile(r"^[0-9A-Fa-f]{4,6}$")

# Lists that may be addressed. The command channel is writable by any HA user,
# so an unvalidated "list" value would let a user read or wipe other lists.
ALLOWED_LISTS = (DEFAULT_LIST,)
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

    # Class-level caches for pure string normalization. Safe across reloads
    # because the output depends only on the input string.
    _norm_cache = {}
    _singularize_cache = {}

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
        # Per-instance cache for catalog lookups; invalidated when the catalog is
        # reloaded so edits to artikel_katalog.json take effect immediately.
        self._catalog_entry_cache = {}

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

        # Non-admin users cannot use the WebSocket fire_event command, so the
        # card also supports writing JSON commands into input_text.einkaufsliste_command.
        self.listen_state(self._on_command_input, COMMAND_INPUT)

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
        tmp = None
        try:
            os.makedirs(self._data_dir, exist_ok=True)
            fd, tmp = tempfile.mkstemp(dir=self._data_dir, suffix=".tmp")
            with os.fdopen(fd, "w", encoding="utf-8") as fh:
                json.dump({"version": 1, "items": self._items},
                          fh, ensure_ascii=False, indent=2)
                fh.flush()
                # os.replace gives atomicity, not durability: without the flush
                # to disk a power cut can leave the renamed file with empty
                # content.
                os.fsync(fh.fileno())
            os.replace(tmp, self._list_path)
            tmp = None
        except Exception as e:
            self.log("List save failed: %s" % e, level="ERROR")
        finally:
            # A failed write must not leave the temp file behind: the data dir
            # would fill up with garbage exactly when the disk is full.
            if tmp is not None:
                try:
                    os.unlink(tmp)
                except OSError:
                    pass

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
        # Catalog content changed: drop cached lookups so a reload or restart
        # picks up edits to artikel_katalog.json immediately.
        self._catalog_entry_cache = {}

    # ------------------------------------------------------------- cataloging

    _NORMALIZE_MAP = str.maketrans({
        "ä": "a", "ö": "o", "ü": "u", "ß": "ss",
        "á": "a", "à": "a", "â": "a", "ã": "a",
        "é": "e", "è": "e", "ê": "e", "ë": "e",
        "í": "i", "ì": "i", "î": "i", "ï": "i",
        "ó": "o", "ò": "o", "ô": "o", "õ": "o",
        "ú": "u", "ù": "u", "û": "u",
        "ñ": "n", "ç": "c", "ý": "y", "æ": "ae", "œ": "oe",
    })

    @classmethod
    def _norm(cls, s):
        if not s:
            return ""
        key = str(s)
        cache = cls._norm_cache
        if key in cache:
            return cache[key]
        n = key.lower().translate(cls._NORMALIZE_MAP)
        n = re.sub(r"[^a-z0-9]+", " ", n).strip()
        if not n:
            # A non-Latin script (Cyrillic, Greek, CJK, ...) reduces to the
            # empty string here. Collapsing every such article to "" would
            # merge unrelated items into one, so fall back to a casefolded,
            # whitespace-collapsed form that keeps them distinct.
            n = " ".join(key.casefold().split())
        cache[key] = n
        return n

    @classmethod
    def _singularize(cls, s):
        """Crude German singularization for dedup matching only.

        Order matters: longer suffixes first so "bananen" -> "banan" (en)
        rather than "banane" (n). "banane" -> "banan" (e). Both collapse to
        the same key, so singular/plural duplicates merge.
        """
        original = cls._norm(s)
        cache = cls._singularize_cache
        if original in cache:
            return cache[original]
        n = original
        for suf in ("en", "n", "er", "e", "s"):
            # require a stem of >=3 chars after stripping so short words like
            # "eis" (-> "ei") don't collapse into "ei" and merge with eggs.
            if n.endswith(suf) and len(n) - len(suf) >= 3:
                n = n[: -len(suf)]
                break
        cache[original] = n
        return n

    def _catalog_entry_for(self, summary):
        """Return matching catalog article entry (dict) or None."""
        if not summary:
            return None
        target = self._norm(summary)
        cache = self._catalog_entry_cache
        if target in cache:
            return cache[target]
        for art in self._catalog.get("artikel", []):
            names = [art.get("name", "")] + list(art.get("aliases", []))
            for nm in names:
                if self._norm(nm) == target:
                    cache[target] = art
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
                    cache[target] = art
                    return art
        cache[target] = None
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

    # -------------------------------------------------------------- validation

    def _clean_summary(self, raw):
        """Normalize an article name to a safe, bounded string.

        The command channel accepts arbitrary JSON, so the value can be any
        type. Anything that is not a string is rejected outright.
        """
        if not isinstance(raw, str):
            return ""
        # Replace control characters (newline, tab, ...) with a space so that
        # words do not get glued together, then collapse the whitespace runs.
        cleaned = "".join(" " if ch < " " else ch for ch in raw)
        return " ".join(cleaned.split())[:MAX_SUMMARY]

    def _clean_qty(self, raw, default=1):
        """Parse a quantity into a bounded int. 0 is a valid value."""
        if raw is None or isinstance(raw, bool):
            return default
        try:
            qty = int(raw)
        except (TypeError, ValueError, OverflowError):
            return default
        # int(float('inf')) raises, but a huge int must not be persisted either.
        if not math.isfinite(qty):
            return default
        return max(0, min(qty, MAX_QTY))

    def _clean_list(self, raw):
        """Return an allowed list id, or the default list.

        The command channel is writable by any user, so an arbitrary list id
        would let one user read or wipe another user's list.
        """
        if raw is None:
            return DEFAULT_LIST
        if not isinstance(raw, str):
            return DEFAULT_LIST
        lst = raw.strip()
        if lst not in ALLOWED_LISTS:
            self.log("rejecting unknown list %r (allowed: %s)"
                     % (lst, ", ".join(ALLOWED_LISTS)), level="WARNING")
            return DEFAULT_LIST
        return lst

    def _clean_icon(self, raw):
        """Return a known OpenMoji codepoint, or the fallback.

        The card fetches a backend-supplied icon and inlines it as SVG. An
        unvalidated value would let any user store a script that then runs in
        every user's dashboard.
        """
        if raw is None:
            return FALLBACK_ICON
        if not isinstance(raw, str):
            return FALLBACK_ICON
        value = raw.strip()
        if not ICON_RE.match(value):
            self.log("rejecting invalid icon %r" % (value,), level="WARNING")
            return FALLBACK_ICON
        return value.upper()

    def _clean_category(self, raw):
        """Return a category name known to the catalog, or None to keep the
        auto-assigned one."""
        if not isinstance(raw, str):
            return None
        value = raw.strip()
        if not value:
            return None
        known = {c.get("name") for c in self._catalog.get("categories", [])}
        known |= {c.get("id") for c in self._catalog.get("categories", [])}
        if value not in known:
            self.log("rejecting unknown category %r" % (value,), level="WARNING")
            return None
        return value

    # ------------------------------------------------------------------ events

    def _on_add(self, event_name, data, **kwargs):
        data = data or {}
        summary = self._clean_summary(data.get("summary"))
        if not summary:
            self.log("add ignored: empty summary", level="WARNING")
            return
        list_id = self._clean_list(data.get("list"))
        qty = self._clean_qty(data.get("quantity"), 1)
        # Only an explicit boolean true disables the dedup merge. A truthy
        # string like "false" would otherwise disable it unintentionally.
        no_dedup = data.get("no_dedup") is True

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
        # An explicit target status makes the command idempotent: a replayed
        # command sets the same status again instead of flipping the item back.
        target_status = data.get("status")
        if target_status not in ("needs_action", "completed"):
            target_status = None
        for it in self._items:
            if it.get("uid") == uid:
                if target_status is not None:
                    if it.get("status") == target_status:
                        self.log("toggle: %s already %s" % (uid, target_status))
                        return
                    it["status"] = target_status
                    it["completed_at"] = (self._now_iso()
                                          if target_status == "completed" else None)
                else:
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
            new_summary = self._clean_summary(data.get("summary"))
            if new_summary:
                it["summary"] = new_summary
                cat_name, icon, _ = self._categorize(it["summary"])
                # re-categorize unless caller pinned category/icon
                if "category" not in data:
                    it["category"] = cat_name
                if "icon" not in data:
                    it["icon"] = icon
            if "quantity" in data:
                # allow 0 (clear quantity); keep existing on None/bad input
                it["quantity"] = self._clean_qty(data["quantity"], it.get("quantity", 1))
            if "category" in data:
                cat = self._clean_category(data["category"])
                if cat is not None:
                    it["category"] = cat
                    it["category_pinned"] = True
            if "icon" in data:
                it["icon"] = self._clean_icon(data["icon"])
                it["icon_pinned"] = True
            self._save_list()
            self._publish()
            self.log("update: %s" % uid)
            return
        self.log("update: uid %s not found" % uid, level="INFO")

    def _on_clear_completed(self, event_name, data, **kwargs):
        data = data or {}
        list_id = self._clean_list(data.get("list"))
        before = len(self._items)
        self._items = [
            it for it in self._items
            if not (it.get("status") == "completed"
                    and it.get("list", DEFAULT_LIST) == list_id)
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
        # Default to the caller's own list. An omitted "list" used to wipe
        # every list in the store.
        list_id = self._clean_list(data.get("list"))
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
        # Re-categorize existing items so they pick up catalog changes. Items
        # whose category or icon was explicitly set by a user are pinned and
        # must survive a reload.
        recategorized = 0
        for it in self._items:
            if it.get("category_pinned") or it.get("icon_pinned"):
                continue
            cat_name, icon, _ = self._categorize(it.get("summary", ""))
            it["category"] = cat_name
            it["icon"] = icon
            recategorized += 1
        self._save_list()
        self._publish()
        self.log("catalog reloaded (%s), re-categorized %d items"
                 % (self._catalog_version, recategorized))

    def _on_command_input(self, entity, attribute, old, new, **kwargs):
        """Handle commands written into input_text.einkaufsliste_command.

        Allows non-admin users to drive the backend: the card calls the
        input_text/set_value service (allowed for regular users) with a JSON
        payload, AppDaemon reads it, executes the command and clears the input.
        """
        if not new or str(new).strip() == "":
            return
        raw = str(new).strip()
        self.log("command input: %s" % raw)
        try:
            data = json.loads(raw)
        except json.JSONDecodeError as e:
            self.log("command input invalid JSON: %s" % e, level="WARNING")
            self._clear_command_input()
            return

        # json.loads accepts any JSON value, but only an object carries an
        # "event" key. Anything else must not reach the handlers.
        if not isinstance(data, dict):
            self.log("command input: payload is %s, not an object"
                     % type(data).__name__, level="WARNING")
            self._clear_command_input()
            return

        # Two wire formats are accepted:
        #   compact:  {"e": "add", "d": {"s": "Milch"}}
        #   verbose:  {"event": "einkaufsliste_add", "data": {"summary": "Milch"}}
        # The compact form exists because Home Assistant caps input_text at 255
        # characters and silently discards longer values.
        event_type, payload = self._parse_command(data)
        if event_type == "einkaufsliste_add":
            self._on_add(event_type, payload)
        elif event_type == "einkaufsliste_remove":
            self._on_remove(event_type, payload)
        elif event_type == "einkaufsliste_toggle":
            self._on_toggle(event_type, payload)
        elif event_type == "einkaufsliste_update":
            self._on_update(event_type, payload)
        elif event_type == "einkaufsliste_clear_completed":
            self._on_clear_completed(event_type, payload)
        elif event_type == "einkaufsliste_clear_all":
            self._on_clear_all(event_type, payload)
        elif event_type == "einkaufsliste_reload_catalog":
            self._on_reload_catalog(event_type, payload)
        else:
            self.log("command input unknown event: %s" % event_type, level="WARNING")

        self._clear_command_input()

    @staticmethod
    def _parse_command(data):
        """Normalize a command envelope to (event_type, payload).

        Supports the compact form the card uses to stay within the 255-char
        input_text limit, and the verbose form for hand-written events.
        """
        compact_fields = {
            "s": "summary",
            "q": "quantity",
            "l": "list",
            "u": "uid",
            "st": "status",
            "c": "category",
            "i": "icon",
        }
        if "e" in data and "event" not in data:
            event_type = "einkaufsliste_%s" % str(data.get("e") or "")
            raw = data.get("d")
            if not isinstance(raw, dict):
                raw = {}
            payload = {compact_fields.get(k, k): v for k, v in raw.items()}
            return event_type, payload
        event_type = data.get("event")
        payload = data.get("data")
        if not isinstance(payload, dict):
            payload = {}
        return event_type, payload

    def _clear_command_input(self):
        """Clear the command channel.

        The service must be used, not set_state: the input_text entity keeps
        its authoritative value internally, and set_state only overwrites the
        state machine entry. The stale value would be restored on the next
        HA restart and would swallow an identically-shaped command.

        AppDaemon expects the service as a single "<domain>/<service>" string;
        passing domain and service as two positional arguments raises
        "not enough values to unpack".
        """
        try:
            self.call_service("input_text/set_value",
                              entity_id=COMMAND_INPUT, value="")
        except Exception as e:
            self.log("failed to clear command input: %s" % e, level="WARNING")

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