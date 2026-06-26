/**
 * Octopus Analytics Card
 * Lovelace custom card for Octopus Energy Germany analytics
 */

class OctopusAnalyticsCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  setConfig(config) {
    this._config = {
      title: "Octopus Energy Analytics",
      show_hourly: true,
      show_monthly: true,
      show_kpis: true,
      ...config,
    };
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  _getState(entityId) {
    const state = this._hass?.states[entityId];
    return state ? state.state : "unavailable";
  }

  _getAttr(entityId, attr) {
    return this._hass?.states[entityId]?.attributes?.[attr];
  }

  _formatKwh(val) {
    const n = parseFloat(val);
    if (isNaN(n)) return "—";
    return n >= 100 ? n.toFixed(1) + " kWh" : n.toFixed(2) + " kWh";
  }

  _formatEur(val) {
    const n = parseFloat(val);
    if (isNaN(n)) return "—";
    return n.toFixed(2) + " €";
  }

  _renderHourlyChart(hourlyData) {
    if (!hourlyData || !hourlyData.length) {
      return `<div class="no-data">Keine Stundendaten verfügbar</div>`;
    }

    const values = hourlyData.map((h) => h.kwh || 0);
    const maxVal = Math.max(...values, 0.001);
    const minVal = Math.min(...values);
    const range = maxVal - minVal;
    const scaleMin = Math.max(0, minVal - range * 0.1);

    const total = values.reduce((a, b) => a + b, 0);
    const dateStr = hourlyData[0]?.start?.substring(0, 10) || "";
    const displayDate = dateStr
      ? dateStr.split("-").reverse().join(".")
      : "Gestern";

    const bars = hourlyData
      .map((h, i) => {
        const val = h.kwh || 0;
        const pct =
          range > 0
            ? Math.max(2, ((val - scaleMin) / (maxVal - scaleMin)) * 100)
            : 2;
        const intensity = range > 0 ? (val - minVal) / range : 0;
        const r = Math.round(80 + intensity * 120);
        const g = Math.round(180 - intensity * 80);
        const hour = h.start ? h.start.substring(11, 13) : String(i).padStart(2, "0");
        return `<div class="bar-wrap" title="${hour}:00 · ${val.toFixed(3)} kWh">
          <div class="bar" style="height:${pct}%;background:rgba(${r},${g},255,0.85)"></div>
        </div>`;
      })
      .join("");

    const yTop = maxVal.toFixed(2);
    const yMid = ((maxVal + scaleMin) / 2).toFixed(2);
    const yBot = scaleMin.toFixed(2);

    return `
      <div class="chart-header">
        <span class="chart-title">Stundenverbrauch ${displayDate}</span>
        <span class="chart-total">∑ ${total.toFixed(3)} kWh</span>
      </div>
      <div class="chart-body">
        <div class="y-axis">
          <span>${yTop}</span>
          <span>${yMid}</span>
          <span>${yBot}</span>
        </div>
        <div class="chart-area">
          <div class="bars">${bars}</div>
          <div class="x-labels">
            <span>0h</span><span>6h</span><span>12h</span><span>18h</span><span>24h</span>
          </div>
        </div>
      </div>`;
  }

  _renderMonthlyChart(last30) {
    if (!last30 || !last30.length) {
      return `<div class="no-data">Keine Tagesdaten verfügbar</div>`;
    }

    const values = last30.map((d) => d.kwh || 0);
    const maxVal = Math.max(...values, 0.001);

    const bars = last30
      .map((d) => {
        const val = d.kwh || 0;
        const pct = Math.max(2, (val / maxVal) * 100);
        const intensity = val / maxVal;
        const r = Math.round(80 + intensity * 120);
        const g = Math.round(180 - intensity * 80);
        const day = d.date ? d.date.substring(8, 10) : "";
        return `<div class="bar-wrap" title="${d.date} · ${val.toFixed(3)} kWh">
          <div class="bar" style="height:${pct}%;background:rgba(${r},${g},255,0.85)"></div>
        </div>`;
      })
      .join("");

    return `
      <div class="chart-header">
        <span class="chart-title">Tagesverbrauch – letzte 30 Tage</span>
      </div>
      <div class="chart-body">
        <div class="chart-area" style="margin-left:0">
          <div class="bars">${bars}</div>
        </div>
      </div>`;
  }

  _renderKPIs() {
    const ytdKwh = this._getState("sensor.octopus_analytics_ytd_verbrauch");
    const ytdCost = this._getState("sensor.octopus_analytics_ytd_kosten");
    const ytdAvg = this._getAttr("sensor.octopus_analytics_ytd_verbrauch", "avg_day_kwh");
    const ytdDays = this._getAttr("sensor.octopus_analytics_ytd_verbrauch", "days");

    const monthKwh = this._getState("sensor.octopus_analytics_monatsverbrauch");
    const monthCost = this._getState("sensor.octopus_analytics_monatskosten");
    const monthAvg = this._getAttr("sensor.octopus_analytics_monatsverbrauch", "avg_day_kwh");
    const monthPeak = this._getAttr("sensor.octopus_analytics_monatsverbrauch", "peak_kwh");
    const monthPeakDate = this._getAttr("sensor.octopus_analytics_monatsverbrauch", "peak_date");

    const prevKwh = this._getState("sensor.octopus_analytics_vormonat_verbrauch");
    const prevCost = this._getState("sensor.octopus_analytics_vormonat_kosten");

    const yesterday = this._getState("sensor.octopus_analytics_verbrauch_gestern");
    const yesterdayCost = this._getState("sensor.octopus_analytics_kosten_gestern");

    const balance = this._getState("sensor.octopus_analytics_kontostand");
    const price = this._getState("sensor.octopus_analytics_strompreis");

    // Month-over-month delta
    const monthN = parseFloat(monthKwh);
    const prevN = parseFloat(prevKwh);
    const delta = !isNaN(monthN) && !isNaN(prevN) && prevN > 0
      ? Math.round(((monthN - prevN) / prevN) * 100)
      : null;
    const deltaStr = delta !== null
      ? `<span class="delta ${delta <= 0 ? "good" : "bad"}">${delta > 0 ? "+" : ""}${delta}% ggü. Vormonat</span>`
      : "";

    const peakStr = monthPeakDate
      ? monthPeakDate.split("-").reverse().join(".")
      : "";

    return `
      <!-- Header KPIs -->
      <div class="kpi-row">
        <div class="kpi-card accent-blue">
          <div class="kpi-label">GESTERN</div>
          <div class="kpi-value">${this._formatKwh(yesterday)}</div>
          <div class="kpi-sub">${this._formatEur(yesterdayCost)}</div>
        </div>
        <div class="kpi-card accent-teal">
          <div class="kpi-label">DIESER MONAT</div>
          <div class="kpi-value">${this._formatKwh(monthKwh)}</div>
          <div class="kpi-sub">${this._formatEur(monthCost)} ${deltaStr}</div>
        </div>
        <div class="kpi-card accent-purple">
          <div class="kpi-label">YTD</div>
          <div class="kpi-value">${this._formatKwh(ytdKwh)}</div>
          <div class="kpi-sub">${this._formatEur(ytdCost)}</div>
        </div>
      </div>

      <!-- Detail row -->
      <div class="detail-row">
        <div class="detail-item">
          <span class="detail-label">Ø Tag (Monat)</span>
          <span class="detail-value">${this._formatKwh(monthAvg)}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Peak (${peakStr})</span>
          <span class="detail-value">${this._formatKwh(monthPeak)}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Ø Tag (YTD)</span>
          <span class="detail-value">${this._formatKwh(ytdAvg)}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Kontostand</span>
          <span class="detail-value">${this._formatEur(balance)}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Strompreis</span>
          <span class="detail-value">${parseFloat(price).toFixed(4)} €/kWh</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Vormonat</span>
          <span class="detail-value">${this._formatKwh(prevKwh)}</span>
        </div>
      </div>`;
  }

  _styles() {
    return `
      :host {
        display: block;
      }
      ha-card {
        background: rgba(0,0,0,0.25);
        backdrop-filter: blur(10px);
        border-radius: 16px;
        padding: 16px;
        color: rgba(255,255,255,0.9);
        font-family: sans-serif;
        border: none;
      }
      .card-title {
        font-size: 13px;
        font-weight: 700;
        color: rgba(255,255,255,0.5);
        text-transform: uppercase;
        letter-spacing: 0.6px;
        margin-bottom: 14px;
      }
      /* KPI Cards */
      .kpi-row {
        display: grid;
        grid-template-columns: 1fr 1fr 1fr;
        gap: 8px;
        margin-bottom: 10px;
      }
      .kpi-card {
        background: rgba(255,255,255,0.06);
        border-radius: 12px;
        padding: 10px;
        border: 1px solid rgba(255,255,255,0.08);
      }
      .kpi-card.accent-blue { border-color: rgba(80,200,255,0.3); }
      .kpi-card.accent-teal { border-color: rgba(80,255,200,0.3); }
      .kpi-card.accent-purple { border-color: rgba(180,100,255,0.3); }
      .kpi-label {
        font-size: 9px;
        color: rgba(255,255,255,0.4);
        letter-spacing: 0.5px;
        margin-bottom: 4px;
      }
      .kpi-value {
        font-size: 16px;
        font-weight: 700;
        color: rgba(255,255,255,0.95);
      }
      .kpi-sub {
        font-size: 11px;
        color: rgba(255,255,255,0.5);
        margin-top: 2px;
      }
      .delta { font-size: 10px; border-radius: 4px; padding: 1px 4px; }
      .delta.good { background: rgba(80,220,120,0.2); color: rgba(80,220,120,0.9); }
      .delta.bad { background: rgba(255,100,80,0.2); color: rgba(255,100,80,0.9); }
      /* Detail row */
      .detail-row {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 6px;
        background: rgba(255,255,255,0.03);
        border-radius: 10px;
        padding: 10px;
        margin-bottom: 14px;
      }
      .detail-item {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .detail-label {
        font-size: 9px;
        color: rgba(255,255,255,0.35);
        text-transform: uppercase;
      }
      .detail-value {
        font-size: 12px;
        font-weight: 600;
        color: rgba(255,255,255,0.8);
      }
      /* Charts */
      .chart-section {
        margin-bottom: 14px;
      }
      .chart-header {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        margin-bottom: 8px;
      }
      .chart-title {
        font-size: 11px;
        font-weight: 600;
        color: rgba(255,255,255,0.5);
        text-transform: uppercase;
        letter-spacing: 0.4px;
      }
      .chart-total {
        font-size: 13px;
        font-weight: 700;
        color: rgba(80,200,255,0.95);
      }
      .chart-body {
        display: flex;
        gap: 6px;
      }
      .y-axis {
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        height: 80px;
        text-align: right;
        flex-shrink: 0;
        font-size: 8px;
        color: rgba(255,255,255,0.35);
      }
      .chart-area {
        flex: 1;
        margin-left: 4px;
      }
      .bars {
        display: flex;
        align-items: flex-end;
        gap: 2px;
        height: 80px;
      }
      .bar-wrap {
        flex: 1;
        height: 100%;
        display: flex;
        align-items: flex-end;
        cursor: default;
      }
      .bar {
        width: 100%;
        border-radius: 2px 2px 0 0;
        min-height: 2px;
        transition: opacity 0.15s;
      }
      .bar-wrap:hover .bar { opacity: 0.75; }
      .x-labels {
        display: flex;
        justify-content: space-between;
        margin-top: 4px;
        font-size: 8px;
        color: rgba(255,255,255,0.3);
      }
      .divider {
        height: 1px;
        background: rgba(255,255,255,0.08);
        margin: 12px 0;
      }
      .no-data {
        color: rgba(255,255,255,0.3);
        font-size: 12px;
        padding: 8px 0;
      }
    `;
  }

  _render() {
    if (!this._hass || !this._config) return;

    const hourlyData = this._getAttr("sensor.octopus_analytics_verbrauch_gestern", "hourly") || [];
    const last30 = this._getAttr("sensor.octopus_analytics_letzte_30_tage_json", "data") || [];

    this.shadowRoot.innerHTML = `
      <style>${this._styles()}</style>
      <ha-card>
        <div class="card-title">${this._config.title}</div>
        ${this._config.show_kpis ? this._renderKPIs() : ""}
        ${this._config.show_hourly ? `<div class="chart-section">${this._renderHourlyChart(hourlyData)}</div>` : ""}
        ${this._config.show_hourly && this._config.show_monthly ? '<div class="divider"></div>' : ""}
        ${this._config.show_monthly ? `<div class="chart-section">${this._renderMonthlyChart(last30)}</div>` : ""}
      </ha-card>`;
  }

  getCardSize() {
    return 6;
  }

  static getConfigElement() {
    return document.createElement("octopus-analytics-card-editor");
  }

  static getStubConfig() {
    return {
      title: "Octopus Energy Analytics",
      show_kpis: true,
      show_hourly: true,
      show_monthly: true,
    };
  }
}

customElements.define("octopus-analytics-card", OctopusAnalyticsCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "octopus-analytics-card",
  name: "Octopus Analytics Card",
  description: "Verbrauchsanalyse für Octopus Energy Germany",
});
