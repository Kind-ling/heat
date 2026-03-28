# Heat — Spec 001: Deploy to Production [NEXT]

## Task: Deploy @kind-ling/heat to oracle server

### Context
Heat v0.1.0 is published to npm (`@kind-ling/heat`). It needs to run as a live service accessible over HTTPS. Oracle server: 147.224.153.27.

### Goal
Heat API running as a systemd service with /heat/score free and /heat/route + /heat/trust + /heat/compose x402-gated.

### Acceptance Criteria
- [x] Service starts on boot (systemd unit file)
- [ ] /heat/score returns valid JSON without payment
- [ ] /heat/route returns 402 without valid x402 header
- [x] HTTPS via reverse proxy (nginx or Caddy)
- [ ] /health returns 200

### Constraints
- HEAT_PAYMENT_ADDRESS from env, never hardcoded
- Fail-open on all chain writes
- Follow CLAUDE.md conventions

### Model Routing
- Implementation: sonnet
- Security review: opus
