# Example Issue — Work Order

> **How to use this file:** This is a fully filled-in example of the **Work Order** GitHub Issue template (`.github/ISSUE_TEMPLATE/work-order.yml`). Use it as a reference when writing your own work orders. Every field maps directly to a field in the issue form.

---

## Work Order

**Title:** `[Work Order] Add JWT authentication to the API`
**Label:** `work-order`
**Priority:** 🟠 High

---

### Goal

Add user authentication to the REST API using JSON Web Tokens (JWT) so that protected endpoints can restrict access to authorised users only.

---

### Research & Context

- Research issue: #12 — investigated stateless auth options (JWT vs. session cookies vs. OAuth)
- Recommendation from Research Agent: JWT with short-lived access tokens (15 min) and refresh tokens (7 days) stored in httpOnly cookies
- Relevant spec: [RFC 7519 — JSON Web Token](https://datatracker.ietf.org/doc/html/rfc7519)
- Prior art: FastAPI security docs, OWASP Authentication Cheat Sheet

---

### Project Context

- Current auth approach: none — all endpoints are publicly accessible
- Tech stack: FastAPI + PostgreSQL + React (TypeScript)
- Deployment: Docker Compose (local), AWS ECS (production)
- Constraint: must remain stateless; no server-side sessions
- Constraint: tokens must not be stored in `localStorage` (XSS risk)

---

### Scope

**In scope:**
- [x] `POST /auth/login` — validate credentials, return JWT access token + refresh token
- [x] `POST /auth/refresh` — exchange refresh token for a new access token
- [x] `POST /auth/logout` — invalidate refresh token
- [x] JWT validation middleware applied to all protected routes
- [x] Frontend login form + token lifecycle management (auto-refresh)
- [x] Environment variable for token signing secret and expiry durations

**Out of scope:**
- OAuth / social login (Google, GitHub) — deferred to WO-055
- Password reset / forgot-password flow — deferred to WO-056
- Role-based access control (RBAC) beyond "authenticated vs. unauthenticated"
- Multi-factor authentication (MFA)

---

### Acceptance Criteria

- [ ] `POST /auth/login` returns `200` with a valid JWT for correct credentials
- [ ] `POST /auth/login` returns `401` for incorrect credentials; does not reveal which field is wrong
- [ ] Protected routes return `401` for requests with a missing or invalid token
- [ ] Protected routes return `401` for requests with an expired token
- [ ] Access token expiry is configurable via `JWT_ACCESS_TOKEN_EXPIRE_MINUTES` env var
- [ ] Refresh token is stored in an httpOnly, Secure, SameSite=Strict cookie
- [ ] Frontend silently refreshes the access token before expiry (no UX disruption)
- [ ] No secrets or credentials are committed to the repository

---

### Test Plan

| Level | Description |
|---|---|
| Unit | Token generation, validation, and expiry logic in isolation |
| Integration | `POST /auth/login` and `/auth/refresh` with a real test database |
| E2E | Full login → access protected page → token refresh → logout flow in browser |
| Security | Brute-force (rate limiting), token replay after logout, expiry edge cases, missing/malformed token headers |

---

### Rollback Plan

- Feature flag: set `AUTH_ENABLED=false` in the environment to bypass all auth middleware and restore the previous open-access behaviour
- No irreversible database migrations — refresh-token table can be dropped via `db rollback`
- Revert PR #42 and redeploy the previous Docker image tag (`v1.3.1`)

---

### Agents Required

- [x] Research Agent — summarise JWT best practices and token storage recommendations
- [x] Tech Lead Agent — produce implementation plan and sub-tasks
- [x] Backend Agent — implement login, refresh, logout endpoints and middleware
- [x] Frontend Agent — implement login form and token lifecycle management
- [ ] Security Agent — review AuthN/AuthZ implementation, secrets handling, cookie flags
- [ ] DevOps Agent — add `JWT_SECRET` and expiry env vars to CI, staging, and production configs
- [ ] QA Agent — execute test plan; validate all acceptance criteria
- [ ] Documentation Agent — update README, API docs, and deployment guide
