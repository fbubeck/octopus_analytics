/**
 * Octopus Analytics Card
 * Lovelace custom card for Octopus Energy Germany analytics
 */

class OctopusAnalyticsCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._activeTab = "overview";
  }

  setConfig(config) {
    this._config = {
      title: "Octopus Energy Analytics",
      show_hourly: true,
      show_monthly: true,
      show_kpis: true,
      monthly_budget_eur: null,
      monthly_payment_eur: null,
      monthly_base_fee_eur: null,
      daily_target_kwh: null,
      anomaly_threshold_percent: 30,
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
    const year = now.getFullYear();
    const months = [];
    for (let month = 1; month <= 12; month++) {
      const key = `${year}-${String(month).padStart(2, "0")}`;
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
        <span class="chart-title">Monatsverbrauch YTD – ${year}</span>
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


  _daysInCurrentMonth() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  }

  _avg(values) {
    const nums = values.map((v) => parseFloat(v)).filter((v) => !isNaN(v));
    return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
  }

  _statusClass(percent) {
    if (percent <= -10) return "good";
    if (percent <= 15) return "warn";
    return "bad";
  }

  _renderTabs() {
    const tabs = [
      ["overview", "Übersicht"],
      ["charts", "Charts"],
      ["forecast", "Analyse & Prognose"],
      ["heatmap", "Heatmap"],
    ];
    return `<div class="tabs">${tabs.map(([id, label]) =>
      `<button class="tab ${this._activeTab === id ? "active" : ""}" data-tab="${id}">${label}</button>`
    ).join("")}</div>`;
  }

  _renderForecast(last30) {
    const monthKwh = parseFloat(this._getState("sensor.octopus_analytics_monatsverbrauch"));
    const monthCost = parseFloat(this._getState("sensor.octopus_analytics_monatskosten"));
    const monthDays = parseFloat(this._getAttr("sensor.octopus_analytics_monatsverbrauch", "days"));
    const daysInMonth = this._daysInCurrentMonth();
    const remaining = Math.max(0, daysInMonth - (monthDays || 0));
    const avgKwh = monthDays > 0 ? monthKwh / monthDays : this._avg((last30 || []).map((d) => d.kwh));
    const avgCost = monthDays > 0 ? monthCost / monthDays : 0;
    const projectedKwh = avgKwh * daysInMonth;
    const projectedCost = avgCost * daysInMonth;
    const unitRate = parseFloat(this._getState("sensor.octopus_analytics_strompreis"));
    const baseFeeMonthly = parseFloat(this._config.monthly_base_fee_eur);
    const standingChargeSensor = parseFloat(this._getState("sensor.octopus_analytics_grundpreis_pro_tag"));
    const standingCharge = !isNaN(baseFeeMonthly)
      ? baseFeeMonthly / daysInMonth
      : standingChargeSensor;
    const projectedEnergyCost = !isNaN(unitRate) ? projectedKwh * unitRate : null;
    const projectedStandingCost = !isNaN(standingCharge) ? standingCharge * daysInMonth : null;
    const costBreakdown = projectedEnergyCost !== null && projectedStandingCost !== null
      ? `AP ${this._formatEur(projectedEnergyCost)} + GP ${this._formatEur(projectedStandingCost)}`
      : `Ist ${this._formatEur(monthCost)}`;
    const paymentSource = this._config.monthly_payment_eur ?? this._config.monthly_budget_eur;
    const payment = parseFloat(paymentSource);
    const paymentDelta = !isNaN(payment) ? payment - projectedCost : null;
    const paymentState = paymentDelta === null ? "neutral" : paymentDelta >= 0 ? "good" : "bad";
    const paymentDeltaText = paymentDelta === null
      ? "—"
      : paymentDelta >= 0
        ? `+${this._formatEur(paymentDelta)}`
        : `−${this._formatEur(Math.abs(paymentDelta))}`;
    const paymentDeltaLabel = paymentDelta === null
      ? "kein Abschlag"
      : paymentDelta >= 0
        ? "Puffer"
        : "Nachzahlung";

    return `
      <div class="section-heading">Abschlagsplanung</div>
      <div class="payment-panel ${paymentState}">
        <div class="money-chip neutral">
          <span>Prognose</span>
          <b>${this._formatEur(projectedCost)}</b>
        </div>
        <div class="money-chip neutral">
          <span>Abschlag</span>
          <b>${paymentDelta === null ? "—" : this._formatEur(payment)}</b>
        </div>
        <div class="money-chip ${paymentState}">
          <span>${paymentDeltaLabel}</span>
          <b>${paymentDeltaText}</b>
        </div>
      </div>
      <div class="mini-note">Grün = Abschlag reicht · Rot = Nachzahlung</div>`;
  }

  _renderTrafficAndAnomalies(last30) {
    const yesterday = parseFloat(this._getState("sensor.octopus_analytics_verbrauch_gestern"));
    const avg30 = this._avg((last30 || []).map((d) => d.kwh));
    const target = parseFloat(this._config.daily_target_kwh) || avg30;
    const diffAvgPct = avg30 > 0 ? ((yesterday - avg30) / avg30) * 100 : 0;
    const diffTargetPct = target > 0 ? ((yesterday - target) / target) * 100 : 0;
    const threshold = parseFloat(this._config.anomaly_threshold_percent) || 30;
    const anomalies = (last30 || [])
      .filter((d) => avg30 > 0 && Math.abs(((d.kwh || 0) - avg30) / avg30 * 100) >= threshold)
      .slice(-6)
      .reverse();

    return `
      <div class="traffic-row">
        <div class="traffic ${this._statusClass(diffAvgPct)}"><span></span><b>Gestern vs. Ø30</b><em>${diffAvgPct > 0 ? "+" : ""}${diffAvgPct.toFixed(0)}%</em></div>
        <div class="traffic ${this._statusClass(diffTargetPct)}"><span></span><b>Gestern vs. Ziel</b><em>${diffTargetPct > 0 ? "+" : ""}${diffTargetPct.toFixed(0)}%</em></div>
      </div>
      <div class="anomaly-box">
        <div class="chart-title">Anomalien letzte 30 Tage</div>
        ${anomalies.length ? anomalies.map((d) => {
          const pct = ((d.kwh - avg30) / avg30) * 100;
          return `<div class="anomaly-item ${pct > 0 ? "bad" : "good"}">
            <span>${this._formatDateDE(d.date)}</span><b>${this._formatKwh(d.kwh)}</b><em>${pct > 0 ? "+" : ""}${pct.toFixed(0)}%</em>
          </div>`;
        }).join("") : `<div class="no-data">Keine Auffälligkeiten über ${threshold}% gefunden.</div>`}
      </div>`;
  }

  _renderHeatmap(last30) {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const days = new Date(year, month + 1, 0).getDate();
    const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7; // Monday=0
    const byDate = Object.fromEntries((last30 || []).map((d) => [d.date, d]));
    const monthPrefix = `${year}-${String(month + 1).padStart(2, "0")}`;
    const vals = Object.values(byDate).filter((d) => d.date?.startsWith(monthPrefix)).map((d) => d.kwh || 0);
    const maxVal = Math.max(...vals, 0.001);
    const cells = [];
    for (let i = 0; i < firstWeekday; i++) cells.push(`<div class="heat-cell empty"></div>`);
    for (let d = 1; d <= days; d++) {
      const key = `${monthPrefix}-${String(d).padStart(2, "0")}`;
      const val = byDate[key]?.kwh || 0;
      const intensity = val / maxVal;
      const alpha = val ? 0.18 + intensity * 0.72 : 0.04;
      cells.push(`<div class="heat-cell has-tooltip" data-tooltip="${this._tooltip(`${this._formatDateDE(key)} · ${val ? val.toFixed(3) + " kWh" : "keine Daten"}`)}" style="background:rgba(80,200,255,${alpha})"><span>${d}</span></div>`);
    }
    return `
      <div class="chart-header"><span class="chart-title">Heatmap Kalender – ${this._monthLabel(monthPrefix)} ${year}</span><span class="chart-total">max ${maxVal.toFixed(2)} kWh</span></div>
      <div class="weekdays"><span>Mo</span><span>Di</span><span>Mi</span><span>Do</span><span>Fr</span><span>Sa</span><span>So</span></div>
      <div class="heatmap">${cells.join("")}</div>`;
  }

  _renderActiveTab(hourlyData, last30, monthly) {
    switch (this._activeTab) {
      case "forecast":
        return `${this._renderForecast(last30)}<div class="divider"></div>${this._renderTrafficAndAnomalies(last30)}`;
      case "heatmap":
        return `${this._renderHeatmap(last30)}`;
      case "charts":
        return `${this._config.show_hourly ? `<div class="chart-section">${this._renderHourlyChart(hourlyData)}</div>` : ""}
          ${this._config.show_hourly && this._config.show_monthly ? '<div class="divider"></div>' : ""}
          ${this._config.show_monthly ? `<div class="chart-section">${this._renderDailyChart(last30)}</div><div class="divider"></div><div class="chart-section">${this._renderYearChart(monthly)}</div>` : ""}`;
      case "overview":
      default:
        return `${this._config.show_kpis ? this._renderKPIs(last30) : ""}
          ${this._renderForecast(last30)}
          <div class="divider"></div>
          ${this._config.show_monthly ? `<div class="chart-section">${this._renderDailyChart(last30)}</div>` : ""}`;
    }
  }

  _renderKPIs(last30 = []) {
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

    const yesterdayN = parseFloat(yesterday);
    const avg30 = this._avg((last30 || []).map((d) => d.kwh));
    const target = parseFloat(this._config.daily_target_kwh) || avg30;
    const diffAvgPct = avg30 > 0 ? ((yesterdayN - avg30) / avg30) * 100 : 0;
    const diffTargetPct = target > 0 ? ((yesterdayN - target) / target) * 100 : 0;
    const avgStatus = this._statusClass(diffAvgPct);
    const targetStatus = this._statusClass(diffTargetPct);
    const trafficBadges = !isNaN(yesterdayN) && avg30 > 0
      ? `<div class="kpi-badges">
          <span class="mini-traffic ${avgStatus}">Ø30 ${diffAvgPct > 0 ? "+" : ""}${diffAvgPct.toFixed(0)}%</span>
          <span class="mini-traffic ${targetStatus}">Ziel ${diffTargetPct > 0 ? "+" : ""}${diffTargetPct.toFixed(0)}%</span>
        </div>`
      : "";

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
          ${trafficBadges}
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
      .tabs {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 6px;
        margin-bottom: 12px;
        background: rgba(255,255,255,0.04);
        padding: 4px;
        border-radius: 12px;
      }
      .tab {
        border: 0;
        border-radius: 9px;
        padding: 7px 4px;
        background: transparent;
        color: rgba(255,255,255,0.55);
        font-size: 11px;
        font-weight: 700;
        cursor: pointer;
      }
      .tab.active {
        background: linear-gradient(135deg, rgba(80,200,255,0.25), rgba(160,100,255,0.22));
        color: rgba(255,255,255,0.95);
        box-shadow: inset 0 0 0 1px rgba(255,255,255,0.08);
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
      .kpi-badges {
        display: flex;
        gap: 4px;
        margin-top: 6px;
        flex-wrap: wrap;
      }
      .mini-traffic {
        font-size: 9px;
        line-height: 1;
        border-radius: 999px;
        padding: 3px 5px;
        font-weight: 800;
      }
      .mini-traffic.good { background: rgba(80,220,120,0.16); color: rgba(80,220,120,0.95); }
      .mini-traffic.warn { background: rgba(255,205,80,0.16); color: rgba(255,205,80,0.95); }
      .mini-traffic.bad { background: rgba(255,100,80,0.16); color: rgba(255,100,80,0.95); }
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
      .section-heading {
        font-size: 11px;
        font-weight: 800;
        color: rgba(255,255,255,0.62);
        text-transform: uppercase;
        letter-spacing: 0.5px;
        margin: 2px 2px 8px;
      }
      .forecast-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 8px;
        margin-bottom: 8px;
      }
      .forecast-card {
        background: rgba(255,255,255,0.06);
        border-radius: 12px;
        padding: 10px;
        border: 1px solid rgba(255,255,255,0.08);
      }
      .accent-red { border-color: rgba(255,100,80,0.35); }
      .payment-panel {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 8px;
        background: rgba(255,255,255,0.035);
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 14px;
        padding: 8px;
        margin-bottom: 8px;
      }
      .payment-panel.good { border-color: rgba(80,220,120,0.25); }
      .payment-panel.bad { border-color: rgba(255,100,80,0.28); }
      .money-chip {
        border-radius: 12px;
        padding: 9px 8px;
        background: rgba(255,255,255,0.06);
        border: 1px solid rgba(255,255,255,0.08);
        text-align: center;
      }
      .money-chip span {
        display: block;
        font-size: 9px;
        font-weight: 800;
        letter-spacing: 0.5px;
        color: rgba(255,255,255,0.45);
        text-transform: uppercase;
        margin-bottom: 4px;
      }
      .money-chip b {
        font-size: 14px;
        color: rgba(255,255,255,0.94);
      }
      .money-chip.good { background: rgba(80,220,120,0.14); border-color: rgba(80,220,120,0.35); }
      .money-chip.good b { color: rgba(110,245,145,0.98); }
      .money-chip.bad { background: rgba(255,100,80,0.14); border-color: rgba(255,100,80,0.35); }
      .money-chip.bad b { color: rgba(255,135,115,0.98); }
      .mini-note {
        font-size: 10px;
        color: rgba(255,255,255,0.42);
        margin: 6px 2px 12px;
      }
      .traffic-row {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
        margin-bottom: 10px;
      }
      .traffic {
        display: grid;
        grid-template-columns: 14px 1fr auto;
        align-items: center;
        gap: 7px;
        background: rgba(255,255,255,0.05);
        border-radius: 12px;
        padding: 9px;
        font-size: 11px;
      }
      .traffic span { width: 10px; height: 10px; border-radius: 50%; background: currentColor; box-shadow: 0 0 12px currentColor; }
      .traffic.good { color: rgba(80,220,120,0.95); }
      .traffic.warn { color: rgba(255,205,80,0.95); }
      .traffic.bad { color: rgba(255,100,80,0.95); }
      .traffic b { color: rgba(255,255,255,0.7); font-weight: 600; }
      .traffic em { font-style: normal; font-weight: 800; }
      .anomaly-box {
        background: rgba(255,255,255,0.035);
        border-radius: 12px;
        padding: 10px;
      }
      .anomaly-item {
        display: grid;
        grid-template-columns: 1fr auto auto;
        gap: 8px;
        align-items: center;
        padding: 6px 0;
        border-bottom: 1px solid rgba(255,255,255,0.06);
        font-size: 11px;
      }
      .anomaly-item:last-child { border-bottom: 0; }
      .anomaly-item.good em { color: rgba(80,220,120,0.95); }
      .anomaly-item.bad em { color: rgba(255,100,80,0.95); }
      .weekdays, .heatmap {
        display: grid;
        grid-template-columns: repeat(7, 1fr);
        gap: 5px;
      }
      .weekdays {
        margin: 8px 0 5px;
        font-size: 9px;
        color: rgba(255,255,255,0.35);
        text-align: center;
      }
      .heat-cell {
        position: relative;
        aspect-ratio: 1;
        border-radius: 9px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: rgba(255,255,255,0.82);
        font-size: 11px;
        border: 1px solid rgba(255,255,255,0.06);
      }
      .heat-cell.empty { opacity: 0; }
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
        ${this._renderTabs()}
        ${this._renderActiveTab(hourlyData, last30, monthly)}
      </ha-card>`;

    this.shadowRoot.querySelectorAll(".tab").forEach((button) => {
      button.addEventListener("click", () => {
        this._activeTab = button.dataset.tab;
        this._render();
      });
    });
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
