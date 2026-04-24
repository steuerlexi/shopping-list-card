# Shopping List Card

A Home Assistant Lovelace custom card for managing multiple shopping lists natively inside Home Assistant — no external app needed.

Inspired by KitchenOwl and Bring!, but built entirely on HA's native `todo` platform.

---

## Features

- Multiple lists on one card (e.g. Aldi, REWE, Drogerie)
- Add, check off, and delete items directly from the card
- Collapsible "done" section per list
- "Clear all done" button
- Live counters for open items
- Fully themed with Home Assistant colors
- Mobile-optimized

---

## Installation

### Manual

1. Copy `dist/shopping-list-card.js` to `/config/www/`
2. Add to Lovelace resources:
   ```yaml
   url: /local/shopping-list-card.js
   type: module
   ```

---

## Prerequisites: Create Todo Lists

Go to **Settings → Devices & Services → Helpers → Create Helper → To-do List**.

Create one list per shop/category, e.g.:
- `todo.aldi`
- `todo.rewe`
- `todo.drogerie`

You can also add them via YAML:
```yaml
todo:
  - Aldi
  - REWE
  - Drogerie
```

---

## Configuration

```yaml
type: custom:shopping-list-card
title: "Einkaufen"
lists:
  - entity: todo.aldi
    name: "Aldi"
    icon: "mdi:cart"
    color: "#e30613"
  - entity: todo.rewe
    name: "REWE"
    icon: "mdi:store"
    color: "#cc0000"
  - entity: todo.drogerie
    name: "Drogerie"
    icon: "mdi:spray-bottle"
    color: "#005eb8"
```

### Options

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `title` | string | `"Einkaufen"` | Card title |
| `lists` | array | **required** | Array of list configs |
| `lists[].entity` | string | **required** | Todo entity ID |
| `lists[].name` | string | entity ID | Display name |
| `lists[].icon` | string | `mdi:cart` | MDI icon |
| `lists[].color` | string | primary color | Hex color for accent |
| `show_delete_always` | boolean | `false` | Always show delete buttons (good for touch) |

---

## Dashboard YAML Example

```yaml
title: Einkaufen
views:
  - title: Einkaufen
    cards:
      - type: custom:shopping-list-card
        title: "Einkaufen"
        show_delete_always: true
        lists:
          - entity: todo.aldi
            name: "Aldi"
            icon: "mdi:cart"
            color: "#e30613"
          - entity: todo.rewe
            name: "REWE"
            icon: "mdi:store"
            color: "#cc0000"
          - entity: todo.drogerie
            name: "Drogerie"
            icon: "mdi:spray-bottle"
            color: "#005eb8"
          - entity: todo.baumarkt
            name: "Baumarkt"
            icon: "mdi:hammer-screwdriver"
            color: "#f57c00"
```

---

## Tips

- The card uses HA's native `todo` services (`todo.add_item`, `todo.update_item`, `todo.remove_item`), so everything syncs automatically across dashboards and the HA mobile app.
- You can add items via voice using Assist: "Füge Milch zur Aldi-Liste hinzu"
- Items checked off in the card are immediately synced to the native todo entity.

---

## License

MIT
