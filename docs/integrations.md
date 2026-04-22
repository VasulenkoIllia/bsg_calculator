# Integrations

Date: 2026-04-23

Current project stage has no external payment/API/webhook integrations.

## Integration: Traefik Reverse Proxy

- Purpose: public routing and TLS termination for frontend container.
- Type: infrastructure integration (Docker network + labels).
- Auth: handled by Traefik/environment setup (outside this repository).
- Routing rule: `Host(${APP_DOMAIN})`.
- Container target port: `80`.
- Health dependency: `GET /health` endpoint served by nginx in container.
- Failure handling:
  - If router/network is misconfigured, domain will not resolve to app.
  - Validate labels, network attachment, and cert resolver config.
- Env vars used:
  - `APP_DOMAIN`
  - `TRAEFIK_NETWORK`
  - `TRAEFIK_ENTRYPOINT`
  - `TRAEFIK_TLS`
  - `TRAEFIK_CERTRESOLVER`

## Integration: Browser Clipboard API

- Purpose: `Zone 6` action "Copy to Clipboard".
- API: `navigator.clipboard.writeText`.
- Failure handling: UI falls back to message to copy manually from preview when clipboard is blocked/unavailable.
- Security notes: depends on browser permission model and secure context policy.

## Integration: Browser Print Dialog (PDF save path)

- Purpose: `Zone 6` actions "Export to PDF" and "Print".
- Mechanism: popup window with generated summary HTML + `window.print()`.
- Failure handling: UI shows popup-blocked message and asks user to allow popups.

## Future integrations

When backend or external providers are added, extend this file with:
- service purpose
- auth model
- retry/timeout policy
- failure modes
- idempotency and callback/webhook validation
