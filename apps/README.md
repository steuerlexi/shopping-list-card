# Einkaufsliste Backend (AppDaemon)

Server-side backend for the **Shopping List Card v2.0.0+**. It replaces HA's
native `todo` shopping_list integration as the source of truth, fixing its
limitations:

- `todo.remove_item` matches by **summary string** → "Banane"/"Bananen"
  confusion. The backend removes strictly by **uid**.
- `todo.remove_item` cannot delete **completed** items. The backend can.
- Auto-categorization & auto-dedup run **server-side** (persisted, shared across
  all devices) instead of per-device in the card.
- AppDaemon is single-threaded per app → no multi-device race conditions.

The card talks to this backend exclusively via HA events and reads the list from
a single sensor:

```
sensor.einkaufsliste_backend
  state:       number of active (needs_action) items
  attributes:
    items:           JSON array of all items (active + completed)
    catalog_version: version string of the loaded artikel_katalog.json
    last_updated:    ISO timestamp of last mutation
    friendly_name:  "Einkaufsliste"
```

---

## Files

| File | Purpose |
|------|---------|
| `einkaufsliste_backend.py` | The AppDaemon app (listener + persistence + cataloging) |
| `apps.yaml`                | AppDaemon registration snippet (append to your `apps.yaml`) |
| `artikel_katalog.json`     | Editable catalog: categories + article aliases + icons — lives **next to the app** |
| `einkaufsliste.json`       | Created at runtime — the persistent list (do not edit by hand). Lives in a **dedicated data dir** (`/config/appdaemon_data/einkaufsliste/` by default), not next to the app, so it survives app reinstalls. |

> The catalog (`artikel_katalog.json`) is hand-edited config and rides along next
> to the app; the list (`einkaufsliste.json`) is generated user data and lives in
> a separate data dir so reinstalling/redeploying the app never wipes your
> shopping list. Override the data dir via `data_dir:` in `apps.yaml` (see below).

---

## Installation

The AppDaemon add-on's config dir is **not** reachable via the HA `/config`
Samba share. Use **Studio Code Server** (or the AppDaemon add-on's own file
access / SSH).

1. Install the **AppDaemon** add-on (Settings → Apps → Add-on Store) if not
   present and start it.
2. Copy these files into the AppDaemon apps directory
   (`/addon_configs/a0d7b954_appdaemon/apps/` on HA OS):
   - `einkaufsliste_backend.py`
   - `artikel_katalog.json`
3. Append the block from `apps.yaml` to your AppDaemon `apps.yaml` (in the same
   directory):
   ```yaml
   einkaufsliste_backend:
     module: einkaufsliste_backend
     class: EinkaufslisteBackend
     # optional: override where einkaufsliste.json is stored
     # data_dir: /config/appdaemon_data/einkaufsliste
   ```
   The persistent list is written to `data_dir` (default
   `/config/appdaemon_data/einkaufsliste/`); the directory is created
   automatically on first run.
4. Restart the AppDaemon add-on (Settings → Apps → AppDaemon → ⋯ → Restart).
5. Confirm in the AppDaemon log (`appdaemon.log`) that it says:
   `Einkaufsliste backend started (N items, catalog 2026-07-30)`.
   The sensor `sensor.einkaufsliste_backend` now exists.

After the first deploy, editing `einkaufsliste_backend.py` hot-reloads
automatically (AppDaemon watches the apps dir). Editing
`artikel_katalog.json` requires an `einkaufsliste_reload_catalog` event or an
AppDaemon restart (see below).

---

## Events (API)

The card fires these via the WebSocket `fire_event` command (HA 2026.x removed
the `homeassistant.fire_event` *service*). You can also fire them from
**Developer Tools → Events** for testing:

| Event | Payload | Effect |
|-------|---------|--------|
| `einkaufsliste_add` | `{summary, quantity?, list?, no_dedup?}` | Add item; auto-dedup + auto-categorize |
| `einkaufsliste_remove` | `{uid}` | Remove item by uid (active **or** completed) |
| `einkaufsliste_toggle` | `{uid}` | Flip needs_action ↔ completed |
| `einkaufsliste_update` | `{uid, summary?, quantity?, category?, icon?}` | Edit fields (long-press edit) |
| `einkaufsliste_clear_completed` | `{list?}` | Delete all completed items |
| `einkaufsliste_clear_all` | `{list?}` | Empty the (entire / given) list |
| `einkaufsliste_import` | `{from_entity?}` | One-shot migration from a native `todo` entity (default `todo.einkaufsliste`) |
| `einkaufsliste_reload_catalog` | `{}` | Reload `artikel_katalog.json` and re-categorize all items |

### Quick test (Developer Tools → Events)

Open **Developer Tools → Events → Fire Event** and enter:

- **Event type:** `einkaufsliste_add`
- **Event data (JSON):**
  ```json
  {"summary": "Bananen", "quantity": 3}
  ```

Then check `sensor.einkaufsliste_backend` — its `items` attribute should contain
the new entry, auto-categorized into **Obst & Gemüse** with icon `1F34C`. Adding
"Banane" afterwards will **merge** into the existing item (quantity increases)
rather than create a duplicate.

---

## Migration from a native todo list

If you are moving from the old `todo.einkaufen` setup, fire the import event once
via **Developer Tools → Events → Fire Event**:

- **Event type:** `einkaufsliste_import`
- **Event data (JSON):**
  ```json
  {"from_entity": "todo.einkaufen"}
  ```

All existing items are read via `todo.get_items`, auto-categorized, and written to
`einkaufsliste.json`. Re-running is safe (already-known uids are skipped). After
verifying, you can disable/ignore the old `todo.einkaufen` entity.

---

## Catalog maintenance (`artikel_katalog.json`)

This is the "Pflege-Erleichterung": edit this JSON to teach the backend new
articles, aliases, categories, or icons — no card edit, no restart needed if you
fire a reload event.

### Structure

```json
{
  "version": "2026-07-30",
  "icon_format": "openmoji_hex",
  "icon_url": "https://cdn.jsdelivr.net/npm/openmoji@latest/color/svg/{hex}.svg",
  "categories": [
    {"id": "obst_gemuese", "name": "Obst & Gemüse", "icon": "1F955", "color": "#E67E22"}
  ],
  "artikel": [
    {"name": "Banane", "aliases": ["Bananen"], "category": "obst_gemuese", "icon": "1F34C"}
  ]
}
```

- `icon` is an **OpenMoji HEX codepoint** (without `0x`), e.g. `1F34C` for
  Banana → `.../color/svg/1F34C.svg`. The authoritative mapping table lives in
  the card repo's `ARTIKEL_ICONS.md`.
- `aliases` are matched (case- and umlaut-insensitive) for both
  auto-categorization and auto-dedup.
- Per-article `"dedup": false` opts an article out of auto-merge (e.g. when you
  want two separate "Apfel" entries).

### Adding a new article

```json
{"name": "Grünkohl", "aliases": ["Grunkohl"], "category": "obst_gemuese", "icon": "1F96C"}
```

### Reloading after editing

Fire a reload event via **Developer Tools → Events → Fire Event**:

- **Event type:** `einkaufsliste_reload_catalog`
- **Event data (JSON):** `{}`

Existing items are re-categorized against the new catalog. The `catalog_version`
attribute on the sensor updates so the card can cache-bust icons.

---

## Troubleshooting

- **Sensor missing after HA restart:** AppDaemon starts after Core. The sensor
  reappears once AppDaemon finishes loading and runs `initialize()`. If it
  stays missing, check `appdaemon.log` for import errors.
- **Items not categorizing:** ensure the `summary` matches an article `name` or
  one of its `aliases` (case/umlaut-insensitive). Unknown items fall back to
  **Sonstiges** with the shopping-cart icon `1F6D2`.
- **Dedup not merging:** the dedup matcher compares singularized forms; very
  short or irregular plurals may not collapse. Add an alias, or send
  `einkaufsliste_add` with `no_dedup: false` (default) and a matching summary.
- **Large lists:** the whole list lives in one sensor attribute. Run
  `einkaufsliste_clear_completed` periodically; for very large catalogs consider
  pruning completed items often.