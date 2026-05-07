# FAQ

## Is this Google Fit?

No. This targets Google Health API v4, not the legacy Google Fit REST API.

## Is this Health Connect?

No. Health Connect is Android/on-device. This connector uses Google Health API v4 over OAuth and HTTPS.

## Is it stable?

It is beta. Google recommends waiting until the end of May 2026 before stable public launch because breaking changes may occur.

## Does it expose raw sensors?

No. `raw` mode means upstream Google Health API JSON for supported endpoints, not raw accelerometer telemetry.
