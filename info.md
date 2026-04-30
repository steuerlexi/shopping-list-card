# Shopping List Card

A Home Assistant Lovelace custom card for managing shopping lists natively inside Home Assistant.

## Features

- **Tile grid view** with auto-mapped MDI icons
- **Auto-categorization** into Obst & Gemüse, Milch & Eier, Fleisch & Fisch, etc.
- **30+ intelligent icon mappings**
- **Search bar** with live filter
- **Long-press edit** for descriptions
- **Collapsible done section**
- **Fully themed** with Home Assistant CSS variables
- **Mobile-optimized**

## Installation

### HACS

1. Open HACS → Frontend → Custom repositories
2. Add `https://github.com/steuerlexi/shopping-list-card`
3. Search for "Shopping List Card" and install
4. Add the resource to your dashboard

### Manual

1. Copy `shopping-list-card.js` to `/config/www/`
2. Add to Lovelace resources:
   ```yaml
   url: /local/shopping-list-card.js
   type: module
   ```

## Configuration

```yaml
type: custom:shopping-list-card
entity: todo.einkaufen
title: "Einkaufen"
icon_map:
  "Spezialartikel": "mdi:star"
```

## License

MIT
