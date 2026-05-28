# Example Pull Request

> **How to use this file:** This is a fully filled-in example of the **Pull Request** template (`.github/pull_request_template.md`). Use it as a reference when writing your own PR descriptions. Every section maps directly to a section in the PR template. The linked issue example is in [`docs/EXAMPLE_ISSUE.md`](./EXAMPLE_ISSUE.md).

---

## Linked Issue

Closes #42

---

## Goal

Add JWT-based authentication to the REST API so that protected endpoints restrict access to authorised users only, without introducing server-side session state.

---

## Summary of Changes

- Added `POST /auth/login`, `POST /auth/refresh`, and `POST /auth/logout` endpoints (FastAPI router `api/routers/auth.py`)
- Added `JWTMiddleware` that validates the `Authorization: Bearer <token>` header on every protected route (`api/middleware/jwt.py`)
- Added a `refresh_tokens` table (Alembic migration `migrations/versions/0042_add_refresh_tokens.py`) to store hashed refresh tokens with expiry timestamps
- Added `JWT_SECRET`, `JWT_ACCESS_TOKEN_EXPIRE_MINUTES`, and `JWT_REFRESH_TOKEN_EXPIRE_DAYS` environment variables; documented in `.env.example`
- Updated the React frontend: login form (`src/components/LoginForm.tsx`), auth context (`src/context/AuthContext.tsx`), and silent refresh logic (`src/hooks/useTokenRefresh.ts`)

---

## Scope

**In scope:**
- [x] `POST /auth/login` — credential validation and token issuance
- [x] `POST /auth/refresh` — access-token renewal via httpOnly refresh-token cookie
- [x] `POST /auth/logout` — refresh-token invalidation
- [x] JWT validation middleware on all protected routes
- [x] Frontend login form and silent token-refresh hook
- [x] Environment variable documentation in `.env.example`

**Out of scope:**
- OAuth / social login — deferred to #55
- Password reset flow — deferred to #56
- RBAC beyond authenticated vs. unauthenticated

---

## Acceptance Criteria

- [x] `POST /auth/login` returns `200` with a valid JWT for correct credentials
- [x] `POST /auth/login` returns `401` for incorrect credentials; does not reveal which field is wrong
- [x] Protected routes return `401` for requests with a missing or invalid token
- [x] Protected routes return `401` for requests with an expired token
- [x] Access token expiry is configurable via `JWT_ACCESS_TOKEN_EXPIRE_MINUTES`
- [x] Refresh token is stored in an httpOnly, Secure, SameSite=Strict cookie
- [x] Frontend silently refreshes the access token before expiry
- [x] No secrets or credentials are committed to the repository

---

## Test Plan

| Level | Result |
|---|---|
| Unit | pass — 34 new tests covering token generation, validation, expiry, and middleware |
| Integration | pass — login, refresh, and logout endpoints tested against test DB |
| E2E | pass — Playwright: login → access protected page → silent refresh → logout |
| Security | pass — brute-force rate limiting verified; token replay after logout returns `401` |

---

## Rollback Plan

The rollback plan from issue #42 remains valid:
- Set `AUTH_ENABLED=false` in the environment to bypass all auth middleware immediately
- Run `alembic downgrade -1` to drop the `refresh_tokens` table if needed
- Revert this PR and redeploy image tag `v1.3.1`

---

## Verification Checklist

### General
- [x] Code compiles / passes lint with no new errors
- [x] All new code is covered by tests
- [x] Existing tests pass

### Security
- [x] No secrets, credentials, or PII are committed
- [x] Input validation and output encoding are in place where required
- [x] RBAC / permission checks are applied to new endpoints or actions
- [x] Security Agent review completed (if required by issue)

### Documentation
- [x] README updated (if setup, usage, or configuration changed)
- [x] Inline code comments added for non-obvious logic
- [x] API docs / OpenAPI spec updated (if applicable)
- [x] `docs/` files updated (if workflow, architecture, or decisions changed)
- [x] Documentation Agent review completed (if required by issue)

### DevOps / Infra
- [x] CI/CD pipeline passes
- [x] Environment variables / secrets documented (not committed)
- [x] Migration scripts included and tested (if applicable)

---

## Agent Sign-offs

- [x] Research Agent — JWT best-practice summary attached to issue #42
- [x] Tech Lead Agent — implementation plan followed; scope respected
- [x] Backend Agent — auth endpoints and middleware implemented
- [x] Frontend Agent — login form and silent-refresh hook implemented
- [x] Security Agent — cookie flags, rate limiting, and token replay reviewed; no blocking findings
- [x] DevOps Agent — env vars added to CI, staging, and production; migration tested in staging
- [x] QA Agent — all 8 acceptance criteria pass; no blocking issues
- [x] Documentation Agent — README, `.env.example`, and API docs updated

---

## Screenshots / Evidence

**Login flow (browser)**

```
POST /auth/login
→ 200 OK  {"access_token": "eyJ...", "token_type": "bearer"}
  Set-Cookie: refresh_token=...; HttpOnly; Secure; SameSite=Strict
```

**Protected route with valid token**

```
GET /api/profile  Authorization: Bearer eyJ...
→ 200 OK  {"id": 1, "email": "user@example.com"}
```

**Protected route with expired token**

```
GET /api/profile  Authorization: Bearer eyJ...<expired>
→ 401 Unauthorized  {"detail": "Token has expired"}
```

**CI pipeline:** all 147 tests pass, 0 errors, coverage 94 %
