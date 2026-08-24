# Sprachtrainer

Web-App zum Lernen und Abfragen von Sätzen zwischen Deutsch, Englisch,
Französisch und Arabisch. Reines HTML/CSS/JS, keine Build-Tools, keine
Frameworks.

## Starten

Browser blockieren `fetch()` auf lokale Dateien (`file://`), deshalb muss
die Seite über einen kleinen lokalen Server geöffnet werden:

```bash
cd sprachtrainer
python3 -m http.server 8000
# dann im Browser: http://localhost:8000
```

Alternativ z. B. mit `npx serve` oder der "Live Server"-Erweiterung in
VS Code. Für den produktiven Einsatz reicht jedes normale Webhosting
(Apache, Nginx, Netlify, GitHub Pages, …) — dort funktioniert `fetch()`
ohne Weiteres.

## Eigene Themen hinzufügen

1. Neue Datei `data/<thema>.json` anlegen, Struktur wie bei den
   bestehenden Themen:

   ```json
   {
     "id": "beruf",
     "sentences": [
       { "de": "...", "en": "...", "fr": "...", "ar": "..." }
     ]
   }
   ```

2. In `data/topics.json` einen Eintrag ergänzen:

   ```json
   { "id": "beruf", "file": "beruf.json", "name": { "de": "Beruf", "en": "Work", "fr": "Travail", "ar": "العمل" } }
   ```

Sätze müssen nicht in allen vier Sprachen vorliegen — beim Start wird
automatisch nur nach Sätzen gefiltert, die sowohl die gewählte
Ausgangs- als auch alle gewählten Zielsprachen enthalten.

**Mehrere akzeptierte Antworten:** Im Testmodus können pro Sprache
alternative Lösungen mit `/` getrennt hinterlegt werden, z. B.
`"en": "Hi / Hello"` — beides wird als richtig gewertet, angezeigt
wird die erste Variante.

## Umgesetzte Extras (über die Grundanforderung hinaus)

- **Fortschrittsanzeige** mit Balken und Zähler während der Sitzung
- **Zufällige Reihenfolge** (an/aus) und **Sitzungslänge** (alle / 10 / 20 / 50 Sätze)
- **Tolerante Auswertung**: Groß-/Kleinschreibung, Satzzeichen und
  überflüssige Leerzeichen werden ignoriert; für Arabisch werden
  zusätzlich Diakritika (Tashkeel) und häufige Buchstabenvarianten
  (ا/أ/إ/آ, ة/ه, ى/ي) toleriert
- **„Nur Fehler wiederholen“** direkt aus dem Ergebnis-Bildschirm
- **Automatisches Rechts-nach-links** für arabischen Text (Satz,
  Eingabefeld, Lösungsanzeige) — unabhängig davon, ob Arabisch
  Ausgangs- oder Zielsprache ist
- **Hell-/Dunkelmodus** mit gespeicherter Präferenz
- **Einstellungen werden gemerkt** (localStorage), inklusive letzter
  Sprach-/Themenauswahl
- **Barrierefreiheit**: sichtbarer Fokusring, `aria-live`-Score,
  ausreichend große Tipp-Ziele, respektiert
  `prefers-reduced-motion`
- **Responsive**: vom Smartphone bis zum Desktop getestet, große
  Touch-Ziele, keine horizontalen Scrollbalken

## Weitere Ideen für den Ausbau

- Lernstatistik pro Thema über die Zeit (z. B. Trefferquote-Verlauf)
- Spaced-Repetition-Logik (falsch beantwortete Sätze häufiger zeigen)
- Audio-Aussprache je Sprache (Web Speech API)
- Import/Export eigener Themen als JSON-Datei direkt im Browser
- Mehrsprachige UI (aktuell ist die Bedienoberfläche auf Deutsch)
