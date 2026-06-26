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


  _tooltip(text) {
    return String(text || "").replace(/"/g, "&quot;");
  }

  _formatDateDE(dateStr) {
    if (!dateStr || dateStr.length < 10) return dateStr || "";
    const [y, m, d] = dateStr.substring(0, 10).split("-");
    return `${d}.${m}.${y}`;
  }

  _monthLabel(monthKey) {
    const names = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
    const m = parseInt(String(monthKey).substring(5, 7), 10);
    return names[m - 1] || monthKey;
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
        return `<div class="bar-wrap has-tooltip" data-tooltip="${this._tooltip(`${hour}:00 Uhr · ${val.toFixed(3)} kWh`)}" title="${hour}:00 · ${val.toFixed(3)} kWh">
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
            <span>0</span><span>3</span><span>6</span><span>9</span><span>12</span><span>15</span><span>18</span><span>21</span><span>24h</span>
          </div>
        </div>
      </div>`;
  }

  _renderDailyChart(last30) {
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
        const label = d.date ? this._formatDateDE(d.date) : "";
        return `<div class="bar-wrap has-tooltip" data-tooltip="${this._tooltip(`${label} · ${val.toFixed(3)} kWh`)}" title="${d.date} · ${val.toFixed(3)} kWh">
          <div class="bar" style="height:${pct}%;background:rgba(${r},${g},255,0.85)"></div>
        </div>`;
      })
      .join("");

    return `
      <div class="chart-header">
        <span class="chart-title">Tagesverbrauch – letzte 30 Tage</span>
        <span class="chart-total">max ${maxVal.toFixed(2)} kWh</span>
      </div>
      <div class="chart-body">
        <div class="chart-area" style="margin-left:0">
          <div class="bars">${bars}</div>
          <div class="x-labels dense-labels">
            ${last30.map((d, i) => i % 5 === 0 || i === last30.length - 1 ? `<span>${d.date?.substring(8, 10) || ""}</span>` : `<span></span>`).join("")}
          </div>
        </div>
      </div>`;
  }

  _renderYearChart(monthly) {
    if (!monthly || !Object.keys(monthly).length) {
      return `<div class="no-data">Keine Monatsdaten verfügbar</div>`;
    }

    const now = new Date();
    const months = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      months.push({ key, label: this._monthLabel(key), data: monthly[key] || null });
    }

    const values = months.map((m) => m.data?.total_kwh || 0);
    const maxVal = Math.max(...values, 0.001);
    const total = values.reduce((a, b) => a + b, 0);

    const bars = months.map((m) => {
      const val = m.data?.total_kwh || 0;
      const pct = val > 0 ? Math.max(3, (val / maxVal) * 100) : 0;
      const intensity = val / maxVal;
      const r = Math.round(100 + intensity * 100);
      const g = Math.round(130 + intensity * 90);
      const tooltip = m.data
        ? `${m.label} ${m.key.substring(0, 4)} · ${val.toFixed(3)} kWh · Ø ${(m.data.avg_day_kwh || 0).toFixed(2)} kWh/Tag · ${m.data.days || 0} Tage`
        : `${m.label} ${m.key.substring(0, 4)} · keine Daten`;
      return `<div class="month-bar-wrap has-tooltip" data-tooltip="${this._tooltip(tooltip)}" title="${this._tooltip(tooltip)}">
        <div class="bar month-bar ${val === 0 ? "empty" : ""}" style="height:${pct}%;background:rgba(${r},${g},255,0.85)"></div>
      </div>`;
    }).join("");

    return `
      <div class="chart-header">
        <span class="chart-title">Monatsverbrauch – letzte 12 Monate</span>
        <span class="chart-total">∑ ${total.toFixed(1)} kWh</span>
      </div>
      <div class="chart-body">
        <div class="chart-area" style="margin-left:0">
          <div class="bars month-bars">${bars}</div>
          <div class="x-labels month-labels">
            ${months.map((m) => `<span>${m.label}</span>`).join("")}
          </div>
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
        position: relative;
      }
      .month-bar-wrap {
        flex: 1;
        height: 100%;
        display: flex;
        align-items: flex-end;
        position: relative;
      }
      .bar {
        width: 100%;
        border-radius: 3px 3px 0 0;
        min-height: 2px;
        transition: opacity 0.15s, transform 0.15s, filter 0.15s;
      }
      .month-bar.empty { min-height: 0; background: rgba(255,255,255,0.08) !important; border-top: 1px dashed rgba(255,255,255,0.15); }
      .bar-wrap:hover .bar, .month-bar-wrap:hover .bar { opacity: 0.9; transform: scaleY(1.03); filter: brightness(1.18); }
      .has-tooltip::after {
        content: attr(data-tooltip);
        position: absolute;
        left: 50%;
        bottom: calc(100% + 8px);
        transform: translateX(-50%);
        background: rgba(10,16,24,0.96);
        color: rgba(255,255,255,0.95);
        border: 1px solid rgba(80,200,255,0.35);
        border-radius: 8px;
        padding: 6px 8px;
        font-size: 11px;
        line-height: 1.25;
        white-space: nowrap;
        pointer-events: none;
        opacity: 0;
        z-index: 10;
        box-shadow: 0 8px 24px rgba(0,0,0,0.35);
      }
      .has-tooltip:hover::after { opacity: 1; }
      .x-labels {
        display: flex;
        justify-content: space-between;
        margin-top: 4px;
        font-size: 8px;
        color: rgba(255,255,255,0.35);
      }
      .dense-labels {
        display: grid;
        grid-template-columns: repeat(30, 1fr);
        gap: 2px;
        text-align: center;
      }
      .month-bars { gap: 5px; height: 95px; }
      .month-labels {
        display: grid;
        grid-template-columns: repeat(12, 1fr);
        gap: 2px;
        text-align: center;
        font-size: 9px;
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
    const monthly = this._getAttr("sensor.octopus_analytics_monatszusammenfassung_json", "data") || {};

    this.shadowRoot.innerHTML = `
      <style>${this._styles()}</style>
      <ha-card>
        <div class="card-title">${this._config.title}</div>
        ${this._config.show_kpis ? this._renderKPIs() : ""}
        ${this._config.show_hourly ? `<div class="chart-section">${this._renderHourlyChart(hourlyData)}</div>` : ""}
        ${this._config.show_hourly && this._config.show_monthly ? '<div class="divider"></div>' : ""}
        ${this._config.show_monthly ? `<div class="chart-section">${this._renderDailyChart(last30)}</div>` : ""}
        ${this._config.show_monthly ? '<div class="divider"></div>' : ""}
        ${this._config.show_monthly ? `<div class="chart-section">${this._renderYearChart(monthly)}</div>` : ""}
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
