# Local-only HTTP transport

The HTTP transport has no client authentication. Startup now fails closed unless
`GOOGLE_HEALTH_MCP_HOST` is exactly `127.0.0.1`, `::1`, or case-insensitive `localhost`. Localhost is
normalized to literal `127.0.0.1` without DNS resolution. An unset host retains the
loopback default; an empty value is rejected. Wildcards (`0.0.0.0`, `::`), other
IP representations, bracketed IPv6, zone IDs, URLs and remote names are rejected.
There is no unsafe override. Port selection and stdio behavior are unchanged.

This deliberately breaks direct LAN/public/container-wildcard binds. Use stdio
or a loopback client. Remote reverse proxies/tunnels need a separate authenticated
access plan; do not treat a loopback upstream as authenticating a proxy's users.
A local reverse proxy or tunnel can still expose this loopback process externally;
binding locally does not prevent that exposure or authenticate those clients.
No proxy, tunnel, account, firewall or deployment configuration is changed here.

Loopback does not protect against other local processes/users or every browser
attack. CORS is not authentication or authorization. IPv6 clients use URLs such as
`http://[::1]:PORT/health`; hosts without IPv6 support must use IPv4 loopback.
This is containment of remote binding, not a multi-user/OAuth design.

The fixture covers helper allow/reject cases, pre-listen rejection in a subprocess
with a safety trap (never opens wildcard sockets), and real loopback HTTP health
responses on IPv4, normalized localhost, and IPv6. It never calls a provider.

Default CORS origins and startup URLs use bracketed IPv6 syntax. An explicitly
configured ALLOWED_ORIGIN is preserved; allowing an origin still does not authenticate it.

For HOST=localhost (any letter case), binding still uses literal 127.0.0.1 without
DNS, but the default browser CORS origin remains http://localhost:PORT. Startup
logs show the actual literal bind address, not the origin.
