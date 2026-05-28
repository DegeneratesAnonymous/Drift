# Work Order Template

Use this template when creating work orders outside of GitHub Issues (e.g. in a document, chat, or other project management tool).

---

## Work Order

**ID / Reference:** <!-- e.g. WO-042 or link to issue -->
**Date:** <!-- YYYY-MM-DD -->
**Author:** <!-- Name or handle -->
**Priority:** <!-- Critical / High / Medium / Low -->

---

### Goal

> What is the high-level objective of this work order? What problem does it solve or what value does it deliver?

<!-- Write your goal here -->

---

### Research & Context

> Relevant prior art, best practices, external standards, or findings from the Research Agent.
> Link to any research docs, ADRs, or external resources.

<!-- e.g.
- Research summary: [link]
- Relevant spec / RFC: [link]
- Competitive / common solutions: [notes]
- Key constraints identified: [notes]
-->

---

### Project Context

> Relevant background about the current project state, architecture decisions, or constraints
> that agents need to be aware of to execute this work order correctly.

<!-- e.g.
- Current tech stack: ...
- Relevant architectural decisions: ...
- Known constraints or non-negotiables: ...
-->

---

### Scope

> Explicit list of what IS and IS NOT in scope.

**In scope:**
- [ ] <!-- task 1 -->
- [ ] <!-- task 2 -->

**Out of scope:**
- <!-- item 1 -->
- <!-- item 2 -->

---

### Acceptance Criteria

> Clear, testable conditions that must be met for this work order to be considered complete.

- [ ] <!-- AC1 -->
- [ ] <!-- AC2 -->
- [ ] <!-- AC3 -->

---

### Test Plan

> High-level testing strategy. The QA Agent will expand on this.

| Level | Description |
|---|---|
| Unit | <!-- e.g. validate input parsing logic --> |
| Integration | <!-- e.g. end-to-end API call with real DB --> |
| E2E | <!-- e.g. full user flow in browser --> |
| Security | <!-- e.g. auth bypass, injection, token expiry --> |
| Performance | <!-- e.g. load test at 1000 req/s --> |

---

### Rollback Plan

> How can this change be safely reverted if issues are discovered in production?

<!-- e.g.
- Feature flag: FEATURE_X_ENABLED=false disables this code path
- DB migrations: migration is reversible with `db rollback`
- Revert: revert PR #XX and re-deploy
-->

---

### Agents Required

- [ ] Research Agent
- [ ] Tech Lead Agent
- [ ] Backend Agent
- [ ] Frontend Agent
- [ ] Security Agent
- [ ] DevOps Agent
- [ ] QA Agent
- [ ] Documentation Agent

---

### Notes & Decisions

<!-- Any additional context, open questions, or decisions made during planning -->

---

### Sign-offs

| Agent / Role | Status | Notes |
|---|---|---|
| Tech Lead | <!-- Approved / Pending --> | |
| Backend | <!-- Complete / Pending --> | |
| Frontend | <!-- Complete / Pending --> | |
| Security | <!-- Approved / Pending --> | |
| DevOps | <!-- Approved / Pending --> | |
| QA | <!-- Passed / Pending --> | |
| Documentation | <!-- Complete / Pending --> | |
