"""Constants for Octopus Analytics integration."""
from datetime import timedelta

DOMAIN = "octopus_analytics"
UPDATE_INTERVAL = timedelta(hours=6)

CONF_EMAIL = "email"
CONF_PASSWORD = "password"

# Sensor keys
SENSOR_YTD_KWH = "ytd_kwh"
SENSOR_YTD_COST = "ytd_cost"
SENSOR_MONTH_KWH = "month_kwh"
SENSOR_MONTH_COST = "month_cost"
SENSOR_MONTH_AVG = "month_avg_day"
SENSOR_MONTH_PEAK = "month_peak_kwh"
SENSOR_PREV_MONTH_KWH = "prev_month_kwh"
SENSOR_PREV_MONTH_COST = "prev_month_cost"
SENSOR_YESTERDAY_KWH = "yesterday_kwh"
SENSOR_YESTERDAY_COST = "yesterday_cost"
SENSOR_BALANCE = "balance"
SENSOR_UNIT_RATE = "unit_rate"
