"""Sicherheitstests fuer die Card.

Stored XSS ueber das Backend-Feld "icon": das Backend speicherte den Wert
unveraendert, die Card lud die daraus gebildete URL, setzte den Inhalt per
innerHTML in den DOM und klonte ihn in die Live-Seite. Ein praepariertes SVG
mit onerror lief dadurch im HA-Origin - fuer jeden Nutzer der Liste, in
jedem Geraet, dauerhaft gespeichert.

Beide Seiten sind jetzt abgesichert:
  - Backend: icons nur als OpenMoji-Codepoint
  - Card: SVG wird per DOMParser geparst und von allem Ausfuehrbaren
    bereinigt; URLs und Pfade werden abgelehnt
"""
import json

import pytest

from conftest import attach_hass, make_items

EVIL_SVG = (
    '<svg xmlns="http://www.w3.org/2000/svg">'
    '<image href="x.png" onerror="window.__XSS_FIRED__=true"/>'
    '<script>window.__XSS_FIRED__=true</script>'
    '</svg>'
)

# Ein SVG mit syntaktischem Fehler. Der XML-Parser (image/svg+xml) ist strenger
# als der HTML-Parser: die Datei wird komplett verworfen. Das ist fail-closed
# und damit das gewuenschte Verhalten - lieber kein Icon als ein
# ausfuehrbares.
EVIL_SVG_BROKEN = (
    '<svg xmlns="http://www.w3.org/2000/svg">'
    '<foreignObject><img src=x onerror="window.__XSS_FIRED__=true"/></foreignObject>'
    '</svg>'
)


def test_svg_parser_strips_event_handlers(page):
    """_parseSvgElement darf keine ausfuehrbaren Attribute durchlassen."""
    attach_hass(page)
    result = page.evaluate(
        """(svg) => {
            const card = document.getElementById('card');
            const el = card._parseSvgElement(svg);
            if (!el) return null;
            const attrs = [];
            el.querySelectorAll('*').forEach(n => {
                for (const a of n.attributes || []) attrs.push(a.name + '=' + a.value);
            });
            return {
                onerror: el.getAttribute('onerror'),
                attrs: attrs,
                scripts: el.querySelectorAll('script').length,
                foreignObjects: el.querySelectorAll('foreignObject').length,
            };
        }""", EVIL_SVG)
    assert result is not None
    assert result["onerror"] is None
    assert result["attrs"] == []
    assert result["scripts"] == 0
    assert result["foreignObjects"] == 0


def test_svg_parser_removes_script_elements(page):
    attach_hass(page)
    count = page.evaluate(
        "(svg) => { const el = document.getElementById('card')._parseSvgElement(svg);"
        " return el ? el.querySelectorAll('script, foreignObject, iframe, object').length : -1; }",
        EVIL_SVG)
    assert count == 0


def test_malformed_svg_is_rejected_entirely(page):
    """Ein syntaktisch kaputtes SVG wird verworfen (fail-closed).

    Der XML-Parser ist strenger als der HTML-Parser - ein fehlerhaftes SVG
    liefert gar kein Element zurueck. Damit kann kein Teil davon in den
    Live-DOM gelangen."""
    attach_hass(page)
    result = page.evaluate(
        "(svg) => document.getElementById('card')._parseSvgElement(svg)",
        EVIL_SVG_BROKEN)
    assert result is None


def test_svg_with_foreign_object_is_rejected(page):
    """Ein wohlgeformtes SVG mit foreignObject wird bereinigt, nicht
    ungeprueft uebernommen."""
    wellformed = (
        '<svg xmlns="http://www.w3.org/2000/svg">'
        '<foreignObject width="10" height="10">'
        '<div xmlns="http://www.w3.org/1999/xhtml">x</div>'
        '</foreignObject></svg>'
    )
    attach_hass(page)
    count = page.evaluate(
        "(svg) => { const el = document.getElementById('card')._parseSvgElement(svg);"
        " return el ? el.querySelectorAll('foreignObject').length : -1; }",
        wellformed)
    assert count == 0


def test_svg_parser_keeps_valid_svg(page):
    """Ein normales SVG muss unveraendert funktionieren."""
    valid = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">'
             '<path d="M0 0h512v512H0z" fill="#000"/></svg>')
    attach_hass(page)
    result = page.evaluate(
        """(svg) => {
            const el = document.getElementById('card')._parseSvgElement(svg);
            if (!el) return null;
            return { tag: el.nodeName.toLowerCase(),
                     paths: el.querySelectorAll('path').length,
                     fill: el.querySelector('path')?.getAttribute('fill') };
        }""", valid)
    assert result is not None
    assert result["tag"] == "svg"
    assert result["paths"] == 1
    assert result["fill"] == "#000"


def test_backend_icon_url_is_refused(page):
    """Ein Icon aus dem Backend darf keine URL und kein Pfad sein."""
    attach_hass(page)
    resolved = page.evaluate(
        """() => document.getElementById('card')._resolveItemIconFile(
             { summary: 'Evil', icon: 'http://evil.example/x.svg' })""")
    assert not str(resolved).startswith("http")
    assert not str(resolved).startswith("/")


def test_backend_icon_path_is_refused(page):
    attach_hass(page)
    resolved = page.evaluate(
        """() => document.getElementById('card')._resolveItemIconFile(
             { summary: 'Evil', icon: '../../etc/passwd.svg' })""")
    assert ".." not in str(resolved)


def test_backend_icon_filename_is_accepted(page):
    """Ein reiner Dateiname ist erlaubt."""
    attach_hass(page)
    resolved = page.evaluate(
        """() => document.getElementById('card')._resolveItemIconFile(
             { summary: 'Apfel', icon: 'apple.svg' })""")
    assert resolved == "apple.svg"


def test_article_names_are_never_html(page):
    """Artikelnamen duerfen nie als HTML interpretiert werden."""
    attach_hass(page, items=[{
        "uid": "x", "summary": "<img src=x onerror=alert(1)>",
        "status": "needs_action", "quantity": 1, "category": "Sonstiges",
        "icon": "1F6D2", "list": "standard"}])
    page.wait_for_timeout(300)
    html = page.evaluate("() => document.getElementById('card').innerHTML")
    assert "<img src=x" not in html
    assert "&lt;img" in html or "onerror" not in html


def test_stylesheet_is_scoped_to_the_host(page):
    """Ohne Shadow DOM waeren die Klassen global und formten andere
    Custom Cards um (.sl-grid, .sl-tile, ...)."""
    attach_hass(page)
    css = page.evaluate(
        """() => {
            const style = document.querySelector('shopping-list-card style');
            return style ? style.textContent : '';
        }""")
    assert css, "kein Stylesheet gefunden"
    # Jede .sl-Klasse muss mit dem Host-Element praefigiert sein.
    import re
    selectors = re.findall(r"(^|[,{])\s*(\.[a-z0-9-]+)", css)
    unscoped = [sel for _, sel in selectors if "shopping-list-card" not in css.split(sel)[0].rsplit(",", 1)[-1].rsplit("{", 1)[-1]]
    for _, sel in selectors:
        # Kontext der letzten 40 Zeichen pruefen
        idx = css.find(sel)
        context = css[max(0, idx - 40):idx]
        assert "shopping-list-card" in context or "@" in context, \
            f"Selektor {sel} ist nicht gescoped: ...{context[-40:]}"
