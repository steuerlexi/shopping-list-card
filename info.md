# Shopping List Card

A Home Assistant Lovelace custom card for managing shopping lists — with a
server-side AppDaemon backend as the single source of truth.

## Features

- **Tile grid view** with OpenMoji color-SVG icons
- **Server-side auto-categorization** (Obst & Gemüse, Milchprodukte, …) — shared across all devices
- **Server-side auto-dedup** — "Banane" merges into "Bananen" instead of duplicating
- **Search bar** with live filter
- **Long-press edit** for quantity and delete
- **Collapsible done section**
- **Removes by uid** (no Banane/Bananen confusion, deletes completed items too)
- Fully themed with Home Assistant CSS variables, mobile-optimized

## Requirements

This card requires the **AppDaemon backend** (`apps/einkaufsliste_backend.py`).
The card reads `sensor.einkaufsliste_backend` and fires HA bus events. See the
[README](README.md) for backend setup and catalog maintenance.

## Installation

### HACS

1. Open HACS → Frontend → Custom repositories
2. Add `https://github.com/steuerlexi/shopping-list-card`
3. Search for "Shopping List Card" and install
4. Add the resource to your dashboard (HACS does this automatically)

### Backend (required)

Copy `apps/einkaufsliste_backend.py` + `apps/artikel_katalog.json` into the
AppDaemon apps dir and register via `apps/apps.yaml`. See README → Installation.

## Configuration

```yaml
type: custom:shopping-list-card
entity: sensor.einkaufsliste_backend
title: "Einkaufen"
```

## License

MIT