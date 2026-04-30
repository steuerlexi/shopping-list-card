# Shopping List Card

[![hacs_badge](https://img.shields.io/badge/HACS-Custom-41BDF5.svg?style=for-the-badge)](https://github.com/hacs/integration)
[![GitHub Release](https://img.shields.io/github/release/steuerlexi/shopping-list-card.svg?style=for-the-badge)](https://github.com/steuerlexi/shopping-list-card/releases)
[![License](https://img.shields.io/github/license/steuerlexi/shopping-list-card.svg?style=for-the-badge)](LICENSE)

A Home Assistant Lovelace custom card for managing shopping lists natively inside Home Assistant — no external app needed.

Built entirely on HA's native `todo` platform.

---

## Features

- **Tile grid view** — Items displayed as responsive tiles with auto-mapped MDI icons
- **Auto-categorization** — Items sorted into categories (Obst & Gemüse, Milch & Eier, Fleisch & Fisch, Trockenwaren, Getränke, etc.)
- **30+ intelligent icon mappings** — "Milch" gets a cheese icon, "Brot" a bread slice, "Eier" an egg, etc.
- **Search bar** — Live filter across all items
- **Green active tiles** with white icons; gray tiles for completed items
- **Colorful slim category headers** with dot indicators
- **Inline add-tile** — Tap to add new items with category selection
- **Long-press edit** — Hold a tile to edit description (e.g. "20 Stück")
- **Collapsible done section**
- **Fully themed** with Home Assistant CSS variables
- **Mobile-optimized**

---

## Installation

### HACS (Recommended)

1. Open HACS → **Frontend** → **Custom repositories**
2. Add repository: `https://github.com/steuerlexi/shopping-list-card`
   - Category: **Lovelace**
3. Click **Download** on the Shopping List Card entry
4. Add to your dashboard resources (HACS does this automatically)
5. Refresh your browser cache (Ctrl+Shift+R)

### Manual

1. Copy `dist/shopping-list-card.js` to `/config/www/`
2. Add to Lovelace resources:
   ```yaml
   url: /local/shopping-list-card.js
   type: module
   ```

---

## Prerequisites

Create a todo list helper:

**Settings → Devices & Services → Helpers → Create Helper → To-do List**

Or via YAML:
```yaml
todo:
  - Einkaufen
```

---

## Configuration

```yaml
type: custom:shopping-list-card
entity: todo.einkaufen
title: "Einkaufen"
icon_map:
  "Spezialartikel": "mdi:star"
```

### Options

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `entity` | string | **required** | Todo entity ID |
| `title` | string | `"Einkaufen"` | Card title |
| `icon_map` | object | `{}` | Override icons for specific items |
| `show_delete_always` | boolean | `false` | Always show delete button on tiles |

### Icon Map Example

```yaml
icon_map:
  "Milch": "mdi:cup-water"
  "Brot": "mdi:bread-slice"
  "Spezialartikel": "mdi:star"
```

---

## Dashboard YAML Example

```yaml
type: custom:shopping-list-card
entity: todo.einkaufen
title: "Einkaufen"
icon_map:
  "Spezialartikel": "mdi:star"
```

---

## Tips

- Uses HA's native `todo` services (`todo.add_item`, `todo.update_item`, `todo.remove_item`)
- Syncs automatically across dashboards and the HA mobile app
- Add items via voice using Assist: "Füge Milch zur Einkaufsliste hinzu"
- Completed items are immediately synced to the native todo entity

---

## License

MIT
