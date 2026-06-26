# Octopus Analytics für Home Assistant

Erweiterte Verbrauchsanalyse für Octopus Energy Germany Kunden.  
Liefert YTD, monatliche KPIs, Stunden-Charts und Tagesvergleiche – direkt aus der Octopus API.

> Hinweis: Dies ist eine Community-/Custom-Integration und keine offizielle Home-Assistant-Core-Integration.

## Features

- **YTD Verbrauch & Kosten** – kumuliert seit Jahresbeginn
- **Monatsverbrauch** – aktueller Monat mit Ø, Peak, Low
- **Vormonatsvergleich** – Trend-Anzeige (↑/↓ gegenüber Vormonat)
- **Stunden-Chart** – Verbrauch des gestrigen Tages stündlich
- **30-Tage-Chart** – Tagesverlauf der letzten 30 Tage
- **Kontostand & Strompreis** – live aus der API
- **Lovelace Card** – glassmorphism Design, passt zu HA Dashboards

## Voraussetzungen

- Home Assistant `2024.1.0` oder neuer
- HACS für die Installation als Custom Repository
- Octopus Energy Germany Account mit E-Mail und Passwort

## Installation via HACS

### 1. Repository hinzufügen

1. HACS öffnen → **Integrationen** → ⋮ → **Benutzerdefinierte Repositories**
2. URL: `https://github.com/fbubeck/octopus_analytics`
3. Kategorie: **Integration**
4. **Hinzufügen** klicken

### 2. Integration installieren

1. HACS → Integrationen → Suche nach **Octopus Analytics**
2. **Herunterladen**
3. Home Assistant neu starten

### 3. Lovelace Card installieren

Die Integration liefert die Custom Lovelace Card ab `v1.0.14` automatisch als statische Datei aus. Du musst keine Datei mehr nach `/config/www` kopieren.

Resource registrieren unter **Einstellungen → Dashboards → Ressourcen**:

```text
/octopus_analytics_static/octopus-analytics-card.js
```

Typ: `JavaScript-Modul`

Alternativ in `configuration.yaml`:

```yaml
lovelace:
  resources:
    - url: /octopus_analytics_static/octopus-analytics-card.js
      type: module
```

Danach Home Assistant bzw. das Dashboard neu laden.

### 4. Integration einrichten

1. **Einstellungen → Geräte & Dienste → Integration hinzufügen**
2. Suche nach **Octopus Analytics**
3. E-Mail und Passwort des Octopus Energy Germany Accounts eingeben

## Lovelace Card verwenden

```yaml
type: custom:octopus-analytics-card
title: Octopus Energy Analytics
show_kpis: true
show_hourly: true
show_monthly: true
monthly_budget_eur: 180      # optional: Monatsbudget
monthly_payment_eur: 160     # optional: monatlicher Abschlag
daily_target_kwh: 5          # optional: Tagesziel für Ampel
anomaly_threshold_percent: 30 # optional: Schwelle für Anomalien
```

## Verfügbare Sensoren

| Entity | Beschreibung |
|--------|-------------|
| `sensor.octopus_analytics_ytd_verbrauch` | YTD kWh (mit Ø und Tage als Attribute) |
| `sensor.octopus_analytics_ytd_kosten` | Geschätzte YTD Gesamtkosten in € (Verbrauch + Grundpreis) |
| `sensor.octopus_analytics_ytd_verbrauchskosten` | YTD Verbrauchskosten in € |
| `sensor.octopus_analytics_ytd_grundpreis` | YTD Grundpreis in € |
| `sensor.octopus_analytics_monatsverbrauch` | Aktueller Monat kWh (mit Peak, Low, Ø) |
| `sensor.octopus_analytics_monatskosten` | Geschätzte aktuelle Monatskosten € |
| `sensor.octopus_analytics_vormonat_verbrauch` | Vormonat kWh |
| `sensor.octopus_analytics_vormonat_kosten` | Vormonat Kosten € |
| `sensor.octopus_analytics_verbrauch_gestern` | Gestern kWh (mit stündlichen Daten als Attribut) |
| `sensor.octopus_analytics_kosten_gestern` | Gestern Kosten € |
| `sensor.octopus_analytics_kontostand` | Kontostand € |
| `sensor.octopus_analytics_strompreis` | Aktueller Strompreis €/kWh |
| `sensor.octopus_analytics_grundpreis_pro_tag` | Grundpreis €/Tag |
| `sensor.octopus_analytics_letzte_30_tage_json` | 30-Tage Daten als JSON-Attribut |
| `sensor.octopus_analytics_monatszusammenfassung_json` | Alle Monate als JSON-Attribut |

## Update-Intervall

Die Daten werden alle **6 Stunden** aktualisiert. Da Octopus die Verbrauchsdaten mit einem Tag Verzug liefert, ist das ausreichend.

## Support

Fehler und Feature-Wünsche bitte über GitHub Issues melden:

<https://github.com/fbubeck/octopus_analytics/issues>

## Lizenz

MIT License – siehe [LICENSE](LICENSE).
