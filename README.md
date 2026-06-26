# Octopus Analytics für Home Assistant

Erweiterte Verbrauchsanalyse für Octopus Energy Germany Kunden.  
Liefert YTD, monatliche KPIs, Stunden-Charts und Tagesvergleiche – direkt aus der Octopus API.

## Features

- **YTD Verbrauch & Kosten** – kumuliert seit Jahresbeginn
- **Monatsverbrauch** – aktueller Monat mit Ø, Peak, Low
- **Vormonatsvergleich** – Trend-Anzeige (↑/↓ gegenüber Vormonat)
- **Stunden-Chart** – Verbrauch des gestrigen Tages stündlich
- **30-Tage-Chart** – Tagesverlauf der letzten 30 Tage
- **Kontostand & Strompreis** – live aus der API
- **Lovelace Card** – glassmorphism Design, passt zu HA Dashboards

## Installation via HACS

### 1. Repository hinzufügen

1. HACS öffnen → **Integrationen** → ⋮ → **Benutzerdefinierte Repositories**
2. URL: `https://github.com/fbubeck/octopus_analytics`
3. Kategorie: **Integration**
4. **Hinzufügen** klicken

### 2. Integration installieren

1. HACS → Integrationen → Suche nach "Octopus Analytics"
2. **Herunterladen** → Home Assistant neu starten

### 3. Lovelace Card registrieren

In `configuration.yaml`:
```yaml
lovelace:
  resources:
    - url: /local/octopus-analytics-card/octopus-analytics-card.js
      type: module
```

Oder unter **Einstellungen → Dashboards → Ressourcen** manuell hinzufügen.

Dann die Dateien aus `www/octopus-analytics-card/` nach `/config/www/octopus-analytics-card/` kopieren.

### 4. Integration einrichten

1. **Einstellungen → Geräte & Dienste → Integration hinzufügen**
2. Suche nach "Octopus Analytics"
3. E-Mail und Passwort des Octopus Energy Germany Accounts eingeben

## Lovelace Card verwenden

```yaml
type: custom:octopus-analytics-card
title: Octopus Energy Analytics
show_kpis: true
show_hourly: true
show_monthly: true
```

## Verfügbare Sensoren

| Entity | Beschreibung |
|--------|-------------|
| `sensor.octopus_analytics_ytd_verbrauch` | YTD kWh (mit Ø und Tage als Attribute) |
| `sensor.octopus_analytics_ytd_kosten` | YTD Kosten in € |
| `sensor.octopus_analytics_monatsverbrauch` | Aktueller Monat kWh (mit Peak, Low, Ø) |
| `sensor.octopus_analytics_monatskosten` | Aktuelle Monatskosten € |
| `sensor.octopus_analytics_vormonat_verbrauch` | Vormonat kWh |
| `sensor.octopus_analytics_vormonat_kosten` | Vormonat Kosten € |
| `sensor.octopus_analytics_verbrauch_gestern` | Gestern kWh (mit stündlichen Daten als Attribut) |
| `sensor.octopus_analytics_kosten_gestern` | Gestern Kosten € |
| `sensor.octopus_analytics_kontostand` | Kontostand € |
| `sensor.octopus_analytics_strompreis` | Aktueller Strompreis €/kWh |
| `sensor.octopus_analytics_letzte_30_tage_json` | 30-Tage Daten als JSON-Attribut |
| `sensor.octopus_analytics_monatszusammenfassung_json` | Alle Monate als JSON-Attribut |

## Update-Intervall

Die Daten werden alle **6 Stunden** aktualisiert. Da Octopus die Verbrauchsdaten mit einem Tag Verzug liefert, ist das ausreichend.

## Lizenz

MIT License
