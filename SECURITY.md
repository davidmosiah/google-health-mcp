# Security Policy

Report security issues through GitHub issues if they do not contain secrets. Do not paste OAuth tokens, client secrets, raw GPS exports or private activity payloads.

## Sensitive Data

- Google Health client secret
- OAuth access and refresh tokens
- Raw activity streams
- GPS coordinates, route maps and polylines
- Private activity metadata

## Defaults

- Tokens stay local under `~/.google-health-mcp/tokens.json`.
- Local config is written with `0600` permissions where supported.
- The server is read-only by default.
- GPS/map data is redacted in `summary` and `structured` modes; `raw` is the only way to
  see it and requires `explicit_user_intent=true`. The claim is backed by named key lists
  (`gps_redacted_keys` and `gps_redacted_container_keys` in `google_health_privacy_audit`)
  and by a behavioural gate (`npm run test:gps-redaction`), not by a hardcoded flag. Google
  Health API v4 does not currently document a location/route data type, so treat this as a
  forward-compatible guard rather than protection against a known upstream leak.
- Coordinate-bearing leaf keys, always dropped (matched ignoring case, `_` and `-`):

  <!-- gps-redacted-keys:start -->
  `startLatitude`, `startLongitude`, `start_latlng`, `endLatitude`, `endLongitude`, `end_latlng`, `latitude`, `longitude`, `lat`, `lon`, `lng`, `latlng`, `coordinates`, `coordinate`, `gps`, `gpx`, `geoPolylineDTO`, `map`, `polyline`, `summary_polyline`, `activities-tracker-gps`, `latitudeE7`, `longitudeE7`, `latE7`, `lngE7`, `lonE7`, `startLatitudeE7`, `startLongitudeE7`, `endLatitudeE7`, `endLongitudeE7`, `lat_deg`, `lng_deg`, `lon_deg`, `latitudeDegrees`, `longitudeDegrees`
  <!-- gps-redacted-keys:end -->

- Location container keys, dropped as a whole object when they hold a place record:

  <!-- gps-redacted-containers:start -->
  `location`, `locations`, `geoLocation`, `geoLocations`, `geo`, `geoJson`, `route`, `routes`, `position`, `positions`, `waypoint`, `waypoints`, `trackPoint`, `trackPoints`, `placeVisit`
  <!-- gps-redacted-containers:end -->

- `npm run test:redaction-docs` compares the two blocks above against the exported lists in
  the code. Documentation drifting from enforcement is a build failure, not a footnote.
- Stated limits: `altitude` and `elevation` are not redacted as location (`altitude` is an
  official v4 data type and does not localize a user on its own; inside a redacted container
  it is dropped with the container). `summary` mode flattens numeric leaves up to depth 2, so
  a coordinate key outside the lists above would be promoted, not hidden — the key list is
  the boundary, not the mode.

## Trust Boundary

This package targets a single trusted local OS user. Google OAuth scopes limit
access to Google Health data, but the MCP server does not authenticate or
authorize individual users, agents, API keys or tools. Tool annotations are not
security controls.

The optional HTTP transport is localhost-only by default and does not ship a
Bearer-token authorization layer. Do not expose it on a public or shared
interface without an authenticated gateway, isolated per-user Google OAuth
credentials and an explicit authorization policy. See
[Authorization Model](docs/authorization.md) for the supported boundary and
multi-user requirements.
