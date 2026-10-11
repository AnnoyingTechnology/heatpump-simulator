# Start from room observations

The static simulator accepts query parameters or a parameter fragment. They initialize a new run before the worker starts. Omitted fields keep the owner's default house. Fragment values override matching query keys. Invalid or repeated fields are ignored with a visible explanation beside the outdoor controls; valid neighbouring fields still apply.

| Parameter | Values |
|---|---|
| `outdoor` | Outdoor temperature, −25…45 °C |
| `humidity` | Outdoor relative humidity, 0…100 % |
| `mode` | `heating` or `cooling` |
| `room.<id>.target` | Setpoint, 16…30 °C |
| `room.<id>.temperature` | Observed room air, 5…35 °C |
| `room.<id>.enabled` | `on` / `off` (also true/false or 1/0) |

Default stable IDs are `ground` (L0), `first` (L1) and `attic` (L2), independent of their order on screen.

Example:

```text
https://annoyingtechnology.github.io/heatpump-simulator/#outdoor=-4&humidity=85&mode=heating&room.ground.target=16&room.ground.temperature=18&room.ground.enabled=on&room.first.target=21.5&room.first.temperature=21.5&room.first.enabled=on&room.attic.temperature=18.5&room.attic.enabled=off
```

The link imports weather and room observations, not compressor history, coil temperatures, wall/floor stored heat, frost, charge or accumulated energy. Those stores use ordinary fresh-run initialization. Early transients therefore depend on unknown initial stores; this is not a complete live-system checkpoint or an OEM performance calibration. No Home Assistant credentials or API connection are required.

## Home Assistant template

Replace these example entity IDs with your own. This produces a URL wherever Home Assistant supports full Jinja templates. Unknown/unavailable readings are omitted rather than replaced with invented measurements. The common system mode comes from the upstairs climate entity; its `heat`/`cool` state maps to the simulator's `heating`/`cooling` modes. Mixed operating modes are not supported.

```jinja
{%- set ns = namespace(params=[]) -%}
{%- set outdoor = states('sensor.outdoor_temperature') -%}
{%- set humidity = states('sensor.outdoor_humidity') -%}
{%- if is_number(outdoor) -%}
  {%- set ns.params = ns.params + [('outdoor', outdoor)] -%}
{%- endif -%}
{%- if is_number(humidity) -%}
  {%- set ns.params = ns.params + [('humidity', humidity)] -%}
{%- endif -%}
{%- set mode = states('climate.upstairs') -%}
{%- if mode in ['heat', 'cool'] -%}
  {%- set ns.params = ns.params + [('mode', 'heating' if mode == 'heat' else 'cooling')] -%}
{%- endif -%}
{%- for room, entity in [('ground', 'climate.ground'), ('first', 'climate.upstairs'), ('attic', 'climate.attic')] -%}
  {%- set state = states(entity) -%}
  {%- set target = state_attr(entity, 'temperature') -%}
  {%- set air = state_attr(entity, 'current_temperature') -%}
  {%- if state in ['heat', 'cool', 'off'] -%}
    {%- set ns.params = ns.params + [('room.' ~ room ~ '.enabled', 'off' if state == 'off' else 'on')] -%}
  {%- endif -%}
  {%- if is_number(target) -%}
    {%- set ns.params = ns.params + [('room.' ~ room ~ '.target', target)] -%}
  {%- endif -%}
  {%- if is_number(air) -%}
    {%- set ns.params = ns.params + [('room.' ~ room ~ '.temperature', air)] -%}
  {%- endif -%}
{%- endfor -%}
https://annoyingtechnology.github.io/heatpump-simulator/#{{ dict(ns.params) | urlencode }}
```

See the official [Home Assistant state-reading documentation](https://www.home-assistant.io/docs/templating/states/) and [Jinja URL encoding filter](https://jinja.palletsprojects.com/en/stable/templates/#jinja-filters.urlencode). This is a template example, not a deployed Home Assistant configuration. The browser parser and actual worker initialization are verified separately in `reviews/url-preconfiguration-browser-results.json`.
