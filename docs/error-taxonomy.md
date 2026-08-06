# Stable error taxonomy

Prefer stable codes for agents:

| Code | Meaning | Agent next step |
|---|---|---|
| AUTH | Missing/expired OAuth | Re-run auth / headless manual flow |
| SCOPE | Scope insufficient | Re-consent with needed scopes |
| EMPTY | Connected but no data in window | Widen window or check data type coverage |
| RATE | Rate limited | Back off; coverage --live should report honestly |

Do not invent medical diagnoses from EMPTY.
