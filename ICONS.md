# Shopping List Card — Lokale SVG-Icons (v2.1.0+)

Ab **v2.1.0** lädt die Karte Artikel- und Kategorie-Icons als lokale SVG-Dateien von `/config/www/shopping-list-card/`.

## Ordnerstruktur

```
/config/www/shopping-list-card/
├── items/               # Artikel-Icons + mapping.json
├── categories/          # Kategorie-Icons (*.svg) + Banner-Hintergründe (*.png)
│   └── animated/        # Optional: animierte Kategorie-Varianten
```

## Dateiformat

- **SVG**, idealerweise `viewBox="0 0 512 512"` (deine Flaticon-Dateien passen sofort).
- Dateinamen am besten **klein, ohne Umlaute, Leerzeichen als Unterstrich**.

## Mapping

Die Karte sucht zu jedem Artikel ein Icon in dieser Reihenfolge:

1. `icon_map` in der Karten-Konfiguration (`type: custom:shopping-list-card`, z. B. `icon_map: {"Apfel": "apple.svg"}`)
2. `items/icon` Attribut vom Backend (wenn du den Katalog darauf umstellst)
3. `/local/shopping-list-card/items/mapping.json` (empfohlen)
4. Fallback: `sonstiges.svg`

### mapping.json

Beispiel (`/config/www/shopping-list-card/items/mapping.json`):

```json
{
  "Apfel": "apple.svg",
  "Bananen": "banana.svg",
  "Milch": "milk.svg",
  "Eier": "eggs.svg",
  "Brot": "bread.svg",
  "Toilettenpapier": "toilet_paper.svg"
}
```

Der Key muss exakt zur `summary` im Backend passen (Groß-/Kleinschreibung). Die Karte versucht auch lowercase.

## Kategorie-Icons

Die Kategorie-Icons werden als **inline SVG** geladen, damit Animationen funktionieren.

Dateinamen:

| Kategorie Key | Statisch | Optional animiert |
|---------------|----------|-------------------|
| `obst_gemuese` | `obst_gemuese.svg` | `animated/obst_gemuese.svg` |
| `brot_backwaren` | `brot_backwaren.svg` | `animated/brot_backwaren.svg` |
| `milch_eier` | `milch_eier.svg` | `animated/milch_eier.svg` |
| `fleisch_fisch` | `fleisch_fisch.svg` | `animated/fleisch_fisch.svg` |
| `trockenwaren` | `trockenwaren.svg` | `animated/trockenwaren.svg` |
| `tiefkuehlprodukte` | `tiefkuehlprodukte.svg` | `animated/tiefkuehlprodukte.svg` |
| `getraenke` | `getraenke.svg` | `animated/getraenke.svg` |
| `haushalt_hygiene` | `haushalt_hygiene.svg` | `animated/haushalt_hygiene.svg` |
| `sonstiges` | `sonstiges.svg` | `animated/sonstiges.svg` |

Wenn eine Datei fehlt, greift die Karte auf ihr eingebautes SVG-Fallback zurück.

## Animationen für Kategorie-Icons

Animierte Kategorie-Icons werden als **inline SVG** geladen, damit CSS-Animationen funktionieren. Unterstützt werden:

- **SVG mit CSS-Animationen** (`<style>` im SVG mit `@keyframes`)
- **SVG mit SMIL-Animationen** (`<animate>`, `<animateTransform>`)

**Nicht unterstützt:** After Effects `.aep` Projektdateien. Du musst ein `.aep` zuerst exportieren, z. B.:

- **Adobe After Effects** → Bodymovin/Lottie-Plugin → **animiertes SVG** oder Lottie JSON (nur SVG wird von der Karte unterstützt)
- Alternativ: Tools wie **SVGator**, **LottieFiles**, oder **Rive** → Export als animiertes SVG

Das exportierte SVG kommt nach `categories/animated/<kategorie>.svg`.

## Wichtig

- Nach dem Hochladen neuer SVGs: **Dashboard/Companion-App Cache leeren**.
- v2.1.3+ zwingt jedes SVG in eine feste Größe (`preserveAspectRatio="xMidYMid meet"`), damit alle Icons einheitlich skalieren — egal ob die SVG-Datei unterschiedliche `width`/`height` Attribute hat.
- Änderungen an `mapping.json` erfordern keinen HA-Neustart, nur einen Seiten-Refresh.
