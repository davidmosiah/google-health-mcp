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
  see it. An agent asking for `privacy_mode=raw` needs `explicit_user_intent=true`; a local
  `GOOGLE_HEALTH_PRIVACY_MODE=raw` default does not (see the stated limits below). The claim
  is backed by named key lists
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
- Stated limits of that promise. Every line below is proved by a behavioural test
  (`npm run test:declared-limits`) that fails if the behaviour changes; a line marked
  **NOT VERIFIED** is a statement no test backs, labelled instead of left to read as a
  guarantee. A limit written here without a test fails the build:

  <!-- declared-limits:start -->
  - `default_mode_is_structured` — with no `privacy_mode` argument and no `GOOGLE_HEALTH_PRIVACY_MODE`, every read runs in `structured`.
  - `raw_requires_explicit_user_intent` — an agent asking for `privacy_mode=raw` is refused with `USER_ACTION_REQUIRED` unless it also passes `explicit_user_intent=true`.
  - `local_raw_default_needs_no_per_call_intent` — `GOOGLE_HEALTH_PRIVACY_MODE=raw` in your own config or environment is honoured on every call with no per-call intent; the gate is about agent escalation, not about the machine owner.
  - `raw_is_an_unfiltered_passthrough` — `raw` returns the upstream payload unchanged; redaction is a property of `structured` and `summary`, never of `raw`.
  - `structured_drops_identity_and_secret_keys` — tokens, `authorization`, e-mail, names and avatars are dropped at any depth in `structured`, while physiology and provenance survive.
  - `summary_is_never_less_restrictive_than_structured` — `summary` strips first and summarizes after, so nothing `structured` drops can reappear in `summary`.
  - `summary_flattens_numeric_leaves_to_depth_2` — `summary` promotes numeric leaves down to depth 2 of the data-type payload into `value`; anything deeper is not reported at all.
  - `summary_promotes_unlisted_coordinate_keys` — a coordinate key outside the lists above is promoted by `summary`, not hidden. The key list is the boundary, not the mode.
  - `altitude_and_elevation_are_not_location` — `altitude` is an official v4 data type (`activity_and_fitness`) and survives redaction, as does `elevation`; an altitude alone does not localize a user.
  - `altitude_inside_a_place_container_is_dropped` — the same altitude inside a redacted location container dies with the container.
  - `location_guard_never_observed_upstream` — NOT VERIFIED: Google Health API v4 documents no location/route data type, so no test here has ever seen a real Google payload carrying coordinates. The key list is a forward-compatible guard derived from Google's own encodings, not a measured fix for an observed leak.
  <!-- declared-limits:end -->

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
