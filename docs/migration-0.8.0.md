# Migrating to 0.8.0

This pre-1.0 minor release tightens formerly accepted configurations. Test your client configuration before replacing a pinned version.

- **HTTP is local-only.** Use `127.0.0.1`, `::1`, or `localhost`, or use stdio. Wildcard/non-loopback binding is rejected. This unauthenticated server is not a remote-access deployment; do not expose it through a public proxy.
- **Authenticated response caching is disabled.** The legacy cache setting does not restore caching. Stop old processes and remove previously persisted cache files if applicable; upgrading does not erase historical data automatically.
- **Profiles are validated and bounded.** Correct invalid field values and shorten oversized data before retrying. Profile storage is limited to 256 KiB, and profile symlinks are rejected. Back up your existing profile privately before migrating; never attach personal profiles or tokens to an issue. Cooperative locking protects cooperating writers, not a hostile filesystem actor or all possible filesystem races.
- **Inputs are bounded.** Tool arguments exceeding the 10,000-element budget and compressed HTTP request bodies are rejected. Reduce requests instead of relying on prior unbounded input behavior.
- **Runtime:** Node.js >=20 remains declared. CI coverage is expanded to Node.js 20, 22 and 24; a configured matrix is not evidence that every client/runtime has already passed.

After installing `google-health-mcp-unofficial@0.8.0`, restart the client/server and check its reported version, doctor output, and offline demo before using your own account. Existing running clients do not upgrade automatically. No account authentication or live health API requests are required for the release fixtures.
