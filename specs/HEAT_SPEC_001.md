# Heat — Spec 001: Deploy to Production [NEXT]

## Task: Deploy @kind-ling/heat to oracle server

### Context
Heat v0.1.0 is published to npm. It needs to run as a live service at heat.kind-ling.com (or oracle.b1e55ed.permanentupperclass.com/heat). The oracle server is at 147.224.153.27.

### Goal
Heat API running as a systemd service, accessible over HTTPS, with /heat/score free and /heat/route + /heat/trust + /heat/compose x402-gated.

### Acceptance Criteria
- [ ] Service starts on boot (systemd unit file)
- [ ] /heat/score returns valid JSON without payment
- [ ] /heat/route returns 402 without valid x402 header
- [ ] HTTPS via reverse proxy (nginx or Caddy)
- [ ] Health check endpoint /health returns 200

### Constraints
- Follow CLAUDE.md conventions
- HEAT_PAYMENT_ADDRESS from env, never hardcoded
- Fail-open on all chain writes

### Model Routing
- Implementation: sonnet
- Security review: opus
