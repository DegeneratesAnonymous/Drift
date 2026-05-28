# Repository Setup Guide — AI Agent Workflow

> **Copy-paste this entire document into your AI assistant to configure an existing repository to use the AI Agent Template workflow.**
>
> The assistant should create each file listed below in the target repository, replacing `<OWNER>/<REPO>` with the actual owner and repository name wherever it appears.

---

## What This Guide Does

This guide configures an existing repository with:

- **GitHub Issue Templates** — structured Work Order and Bug Report forms so agents can act autonomously on every issue
- **Pull Request Template** — a standardised PR form with agent sign-offs and a verification checklist
- **GitHub Actions Workflows** — auto-post agent chain checklists on every new issue or PR, and restart the chain when the `qa-failed` label is applied
- **Dev Workflow Documentation** — the step-by-step workflow guide and offline work order template
- **Agent Prompt Files** — copy-paste-ready prompts for each agent role (Research, Tech Lead, Backend, Frontend, DevOps, Security, QA, Documentation)

---

## Setup Checklist

- [ ] Step 1 — Create `.github/ISSUE_TEMPLATE/config.yml`
- [ ] Step 2 — Create `.github/ISSUE_TEMPLATE/work-order.yml`
- [ ] Step 3 — Create `.github/ISSUE_TEMPLATE/bug-report.yml`
- [ ] Step 4 — Create `.github/pull_request_template.md`
- [ ] Step 5 — Create `.github/workflows/agent-workflow.yml`
- [ ] Step 6 — Create `.github/workflows/qa-retry.yml`
- [ ] Step 7 — Create `docs/DEV_WORKFLOW.md`
- [ ] Step 8 — Create `docs/WORK_ORDER_TEMPLATE.md`
- [ ] Step 9 — Create `docs/dev-agents/README.md`
- [ ] Step 10 — Create `docs/dev-agents/RESEARCH.md`
- [ ] Step 11 — Create `docs/dev-agents/TECH_LEAD.md`
- [ ] Step 12 — Create `docs/dev-agents/BACKEND.md`
- [ ] Step 13 — Create `docs/dev-agents/FRONTEND.md`
- [ ] Step 14 — Create `docs/dev-agents/DEVOPS.md`
- [ ] Step 15 — Create `docs/dev-agents/SECURITY.md`
- [ ] Step 16 — Create `docs/dev-agents/QA.md`
- [ ] Step 17 — Create `docs/dev-agents/DOCUMENTATION.md`
- [ ] Step 18 — Create the `qa-failed` label in the repository

---

## Step 1 — `.github/ISSUE_TEMPLATE/config.yml`

> Replace `<OWNER>/<REPO>` with the target repository's owner and name.

```yaml
blank_issues_enabled: false
contact_links:
  - name: 📖 Dev Workflow Guide
    url: https://github.com/<OWNER>/<REPO>/blob/main/docs/DEV_WORKFLOW.md
    about: Read the full step-by-step development workflow before opening an issue.
```

---

## Step 2 — `.github/ISSUE_TEMPLATE/work-order.yml`

```yaml
name: Work Order
description: Submit a scoped task or feature request for AI-agent-driven development.
title: "[Work Order] "
labels: ["work-order"]
body:
  - type: markdown
    attributes:
      value: |
        Use this template to create a structured work order for the multi-agent development workflow.
        Fill in each section as completely as possible so agents can act autonomously.

  - type: textarea
    id: goal
    attributes:
      label: Goal
      description: What is the high-level objective of this work order? What problem does it solve?
      placeholder: "e.g. Add user authentication with JWT tokens to the API."
    validations:
      required: true

  - type: textarea
    id: research
    attributes:
      label: Research & Context
      description: |
        Relevant prior art, best practices, external standards, or findings from the Research Agent.
        Link to any research issues, ADRs, or external resources.
      placeholder: |
        - Research issue: #XX
        - Relevant RFC / spec: https://...
        - Prior art / competitive solutions: ...
    validations:
      required: false

  - type: textarea
    id: context
    attributes:
      label: Project Context
      description: |
        Relevant background about the current project state, architecture decisions, or constraints
        that agents need to be aware of to execute this work order correctly.
      placeholder: |
        - Current auth approach: none
        - Tech stack: FastAPI + PostgreSQL + React
        - Constraint: Must remain stateless (no sessions)
    validations:
      required: true

  - type: textarea
    id: scope
    attributes:
      label: Scope
      description: |
        Explicit list of what IS and IS NOT in scope for this work order.
        Break down by area if applicable (backend, frontend, infra, docs, etc.).
      placeholder: |
        **In scope:**
        - [ ] POST /auth/login endpoint
        - [ ] JWT issuance and validation middleware
        - [ ] Frontend login form + token storage

        **Out of scope:**
        - OAuth / social login
        - Password reset flow
    validations:
      required: true

  - type: textarea
    id: acceptance
    attributes:
      label: Acceptance Criteria
      description: |
        Clear, testable criteria that must be met for this work order to be considered complete.
        Written as "Given / When / Then" or as a checklist.
      placeholder: |
        - [ ] Users can obtain a JWT by providing valid credentials
        - [ ] Protected routes return 401 for missing/invalid tokens
        - [ ] Token expiry is configurable via environment variable
        - [ ] Frontend stores token in httpOnly cookie (not localStorage)
    validations:
      required: true

  - type: textarea
    id: test_plan
    attributes:
      label: Test Plan
      description: |
        High-level testing strategy for this work order. The QA Agent will expand on this.
        Include unit, integration, and end-to-end test expectations.
      placeholder: |
        - Unit: token generation and validation logic
        - Integration: login endpoint with real DB
        - E2E: full login flow in the browser
        - Security: brute-force, token replay, expiry edge cases
    validations:
      required: false

  - type: textarea
    id: rollback
    attributes:
      label: Rollback Plan
      description: |
        How can this change be safely reverted if issues are found in production?
        Note any migration steps, feature flags, or data concerns.
      placeholder: |
        - Feature flag: AUTH_ENABLED=false disables all auth middleware
        - No DB migrations required for rollback
        - Revert PR #XX to restore previous behaviour
    validations:
      required: false

  - type: dropdown
    id: priority
    attributes:
      label: Priority
      options:
        - "🔴 Critical"
        - "🟠 High"
        - "🟡 Medium"
        - "🟢 Low"
    validations:
      required: true

  - type: checkboxes
    id: agents
    attributes:
      label: Agents Required
      description: Which agents need to act on this work order?
      options:
        - label: Research Agent
        - label: Tech Lead Agent
        - label: Backend Agent
        - label: Frontend Agent
        - label: Security Agent
        - label: DevOps Agent
        - label: QA Agent
        - label: Documentation Agent
```

---

## Step 3 — `.github/ISSUE_TEMPLATE/bug-report.yml`

```yaml
name: Bug Report
description: Report a defect or unexpected behaviour for triage and resolution.
title: "[Bug] "
labels: ["bug"]
body:
  - type: markdown
    attributes:
      value: |
        Use this template to report a reproducible bug. Fill in every section so agents can triage and fix it autonomously.

  - type: textarea
    id: goal
    attributes:
      label: Goal
      description: What were you trying to achieve when the bug occurred?
      placeholder: "e.g. Authenticate a user via the /auth/login endpoint."
    validations:
      required: true

  - type: textarea
    id: context
    attributes:
      label: Project Context
      description: |
        Relevant background about the environment, version, or configuration where the bug occurs.
      placeholder: |
        - Version / commit: v1.2.3 or SHA abc1234
        - Environment: production / staging / local
        - OS / runtime: Ubuntu 22.04, Node 20
    validations:
      required: true

  - type: textarea
    id: scope
    attributes:
      label: Scope
      description: |
        What IS affected (files, endpoints, features) and what is NOT affected.
      placeholder: |
        **Affected:**
        - POST /auth/login endpoint
        - JWT validation middleware

        **Not affected:**
        - Registration flow
        - Password reset
    validations:
      required: true

  - type: textarea
    id: acceptance
    attributes:
      label: Acceptance Criteria
      description: |
        Clear, testable conditions that must be met for this bug to be considered fixed.
      placeholder: |
        - [ ] POST /auth/login returns 200 with a valid JWT for correct credentials
        - [ ] No 500 errors appear in logs during normal login
    validations:
      required: true

  - type: textarea
    id: reproduction
    attributes:
      label: Steps to Reproduce
      description: Minimal steps to consistently reproduce the bug.
      placeholder: |
        1. Send POST /auth/login with `{"email":"user@example.com","password":"correct"}`
        2. Observe 500 Internal Server Error
        3. Check logs for `TypeError: Cannot read properties of undefined`
    validations:
      required: true

  - type: textarea
    id: test_plan
    attributes:
      label: Test Plan
      description: |
        How should the fix be tested? The QA Agent will expand on this.
      placeholder: |
        - Unit: mock DB, verify token is returned on valid credentials
        - Integration: real DB, full login request
        - Regression: ensure existing auth tests still pass
    validations:
      required: false

  - type: textarea
    id: rollback
    attributes:
      label: Rollback Plan
      description: |
        How can a failed fix be safely reverted?
      placeholder: |
        - Feature flag: AUTH_ENABLED=false bypasses the affected middleware
        - Revert PR #XX to restore previous behaviour
    validations:
      required: false

  - type: dropdown
    id: priority
    attributes:
      label: Priority
      options:
        - "🔴 Critical"
        - "🟠 High"
        - "🟡 Medium"
        - "🟢 Low"
    validations:
      required: true

  - type: checkboxes
    id: agents
    attributes:
      label: Agents Required
      description: Which agents need to act on this bug report?
      options:
        - label: Research Agent
        - label: Tech Lead Agent
        - label: Backend Agent
        - label: Frontend Agent
        - label: Security Agent
        - label: DevOps Agent
        - label: QA Agent
        - label: Documentation Agent
```

---

## Step 4 — `.github/pull_request_template.md`

````markdown
## Linked Issue

<!-- Link to the work order or bug report this PR addresses -->
Closes #

---

## Goal

<!-- Restate the goal from the linked issue in one sentence -->

---

## Summary of Changes

<!-- Brief description of what was changed and why, scoped to the issue's Goal -->

---

## Scope

<!-- Confirm what IS and IS NOT addressed by this PR -->

**In scope:**
- [ ] <!-- change 1 -->

**Out of scope:**
- <!-- anything explicitly excluded -->

---

## Acceptance Criteria

<!-- Copy each AC from the linked issue and mark it complete -->

- [ ] <!-- AC1 -->
- [ ] <!-- AC2 -->

---

## Test Plan

<!-- Summarise how changes were tested, matching the Test Plan from the linked issue -->

| Level | Result |
|---|---|
| Unit | <!-- pass / fail / N/A --> |
| Integration | <!-- pass / fail / N/A --> |
| E2E | <!-- pass / fail / N/A --> |
| Security | <!-- pass / fail / N/A --> |

---

## Rollback Plan

<!-- Confirm the rollback plan from the linked issue is still valid, or describe any changes -->

---

## Verification Checklist

### General
- [ ] Code compiles / passes lint with no new errors
- [ ] All new code is covered by tests
- [ ] Existing tests pass

### Security
- [ ] No secrets, credentials, or PII are committed
- [ ] Input validation and output encoding are in place where required
- [ ] RBAC / permission checks are applied to new endpoints or actions
- [ ] Security Agent review completed (if required by issue)

### Documentation
- [ ] README updated (if setup, usage, or configuration changed)
- [ ] Inline code comments added for non-obvious logic
- [ ] API docs / OpenAPI spec updated (if applicable)
- [ ] `docs/` files updated (if workflow, architecture, or decisions changed)
- [ ] Documentation Agent review completed (if required by issue)

### DevOps / Infra
- [ ] CI/CD pipeline passes
- [ ] Environment variables / secrets documented (not committed)
- [ ] Migration scripts included and tested (if applicable)

---

## Agent Sign-offs

<!-- Check off each agent that has reviewed / completed their portion -->
- [ ] Research Agent — findings incorporated
- [ ] Tech Lead Agent — plan followed, scope respected
- [ ] Backend Agent — implementation complete
- [ ] Frontend Agent — implementation complete
- [ ] Security Agent — security review passed
- [ ] DevOps Agent — pipeline and infra verified
- [ ] QA Agent — test plan executed, no blocking issues
- [ ] Documentation Agent — docs and README updated

---

## Screenshots / Evidence

<!-- Attach screenshots, logs, or test output that demonstrate the changes work as expected -->
````

---

## Step 5 — `.github/workflows/agent-workflow.yml`

```yaml
name: Agent Workflow Orchestration

on:
  issues:
    types: [opened]
  pull_request:
    types: [opened]

jobs:
  post-workflow-checklist:
    runs-on: ubuntu-latest
    permissions:
      issues: write
      pull-requests: write
    steps:
      - name: Ensure qa-failed label exists
        uses: actions/github-script@v7
        with:
          script: |
            try {
              await github.rest.issues.getLabel({
                owner: context.repo.owner,
                repo: context.repo.repo,
                name: 'qa-failed',
              });
            } catch (e) {
              if (e.status === 404) {
                await github.rest.issues.createLabel({
                  owner: context.repo.owner,
                  repo: context.repo.repo,
                  name: 'qa-failed',
                  color: 'd93f0b',
                  description: 'QA found blocking defects; agent workflow requires restart with QA context.',
                });
              }
            }

      - name: Post agent workflow checklist
        uses: actions/github-script@v7
        with:
          script: |
            const isPR = context.eventName === 'pull_request';
            const number = isPR
              ? context.payload.pull_request.number
              : context.payload.issue.number;
            const type = isPR ? 'pull request' : 'issue';

            const body = [
              '## 🤖 Agent Workflow Initiated',
              '',
              `This ${type} has been picked up by the automated agent workflow.`,
              'Work through each step in order, using the linked prompt file to invoke each agent.',
              'Paste each agent\'s output as context for the next step in the chain.',
              '',
              '---',
              '',
              '### Agent Chain',
              '',
              '- [ ] **Step 1 — 🔬 Research Agent** [`docs/dev-agents/RESEARCH.md`](../blob/main/docs/dev-agents/RESEARCH.md)',
              '  Investigate the issue, gather best practices, and produce a structured research summary.',
              '  _Output → feed into Tech Lead as context._',
              '',
              '- [ ] **Step 2 — 🗺️ Tech Lead Agent** [`docs/dev-agents/TECH_LEAD.md`](../blob/main/docs/dev-agents/TECH_LEAD.md)',
              '  Review research output, define interface contracts, and assign sub-tasks to each agent.',
              '  _Output → sub-task lists used by all subsequent agents._',
              '',
              '- [ ] **Step 3 — ⚙️ Backend Agent** [`docs/dev-agents/BACKEND.md`](../blob/main/docs/dev-agents/BACKEND.md)',
              '  Implement backend sub-tasks as defined by the Tech Lead.',
              '',
              '- [ ] **Step 4 — 🖥️ Frontend Agent** [`docs/dev-agents/FRONTEND.md`](../blob/main/docs/dev-agents/FRONTEND.md)',
              '  Implement frontend sub-tasks as defined by the Tech Lead.',
              '',
              '- [ ] **Step 5 — 🚀 DevOps Agent** [`docs/dev-agents/DEVOPS.md`](../blob/main/docs/dev-agents/DEVOPS.md)',
              '  Handle CI/CD, environment, infrastructure, and dependency tasks.',
              '',
              '- [ ] **Step 6 — 🔒 Security Agent** [`docs/dev-agents/SECURITY.md`](../blob/main/docs/dev-agents/SECURITY.md)',
              '  Review all implementation for security issues. All findings must be resolved before QA.',
              '',
              '- [ ] **Step 7 — 🧪 QA Agent** [`docs/dev-agents/QA.md`](../blob/main/docs/dev-agents/QA.md)',
              '  Execute the test plan against all acceptance criteria.',
              '  > ⚠️ **If blocking defects are found:** document findings in a comment and apply the `qa-failed` label.',
              '  > The workflow will restart from Step 1 with QA findings included as additional context.',
              '',
              '- [ ] **Step 8 — 📚 Documentation Agent** [`docs/dev-agents/DOCUMENTATION.md`](../blob/main/docs/dev-agents/DOCUMENTATION.md)',
              '  Update README, `docs/`, and any other affected documentation to reflect all completed changes.',
              '',
              '---',
              '',
              '> 📖 Full workflow guide: [`docs/DEV_WORKFLOW.md`](../blob/main/docs/DEV_WORKFLOW.md)',
            ].join('\n');

            await github.rest.issues.createComment({
              owner: context.repo.owner,
              repo: context.repo.repo,
              issue_number: number,
              body,
            });
```

---

## Step 6 — `.github/workflows/qa-retry.yml`

```yaml
name: QA Retry — Restart Agent Workflow

on:
  issues:
    types: [labeled]

jobs:
  post-qa-retry:
    if: github.event.label.name == 'qa-failed'
    runs-on: ubuntu-latest
    permissions:
      issues: write
    steps:
      - name: Post QA retry instructions
        uses: actions/github-script@v7
        with:
          script: |
            const number = context.payload.issue.number;

            const body = [
              '## 🔄 QA Failed — Restarting Agent Workflow',
              '',
              'The QA Agent has identified blocking defects. The agent workflow is restarting from Step 1.',
              '**Include the QA findings documented above as additional context for every agent in this new pass.**',
              '',
              '---',
              '',
              '### Agent Chain (Remediation Pass — with QA context)',
              '',
              '- [ ] **Step 1 — 🔬 Research Agent** [`docs/dev-agents/RESEARCH.md`](../blob/main/docs/dev-agents/RESEARCH.md)',
              '  Re-investigate with QA findings as additional context. Focus on defect root causes.',
              '',
              '- [ ] **Step 2 — 🗺️ Tech Lead Agent** [`docs/dev-agents/TECH_LEAD.md`](../blob/main/docs/dev-agents/TECH_LEAD.md)',
              '  Update the implementation plan to address all defects reported by QA.',
              '',
              '- [ ] **Step 3 — ⚙️ Backend Agent** [`docs/dev-agents/BACKEND.md`](../blob/main/docs/dev-agents/BACKEND.md)',
              '  Apply the Tech Lead\'s updated plan to fix backend defects.',
              '',
              '- [ ] **Step 4 — 🖥️ Frontend Agent** [`docs/dev-agents/FRONTEND.md`](../blob/main/docs/dev-agents/FRONTEND.md)',
              '  Apply the Tech Lead\'s updated plan to fix frontend defects.',
              '',
              '- [ ] **Step 5 — 🚀 DevOps Agent** [`docs/dev-agents/DEVOPS.md`](../blob/main/docs/dev-agents/DEVOPS.md)',
              '  Verify infrastructure and CI/CD changes are still valid after the fix.',
              '',
              '- [ ] **Step 6 — 🔒 Security Agent** [`docs/dev-agents/SECURITY.md`](../blob/main/docs/dev-agents/SECURITY.md)',
              '  Re-review the updated implementation for any new or unresolved security issues.',
              '',
              '- [ ] **Step 7 — 🧪 QA Agent** [`docs/dev-agents/QA.md`](../blob/main/docs/dev-agents/QA.md)',
              '  Re-execute the full test plan. Confirm all previously reported defects are resolved.',
              '  > ⚠️ **If blocking defects remain:** document findings and re-apply the `qa-failed` label.',
              '',
              '- [ ] **Step 8 — 📚 Documentation Agent** [`docs/dev-agents/DOCUMENTATION.md`](../blob/main/docs/dev-agents/DOCUMENTATION.md)',
              '  Update documentation to reflect any changes made during this remediation pass.',
              '',
              '---',
              '',
              '> Once QA passes, remove the `qa-failed` label and proceed to merge.',
            ].join('\n');

            await github.rest.issues.createComment({
              owner: context.repo.owner,
              repo: context.repo.repo,
              issue_number: number,
              body,
            });
```

---

## Step 7 — `docs/DEV_WORKFLOW.md`

```markdown
# Development Workflow

This document describes the end-to-end workflow for AI-agent-driven development in this repository.
Each work order moves through a series of agent roles — from research and planning through implementation, security review, QA, and documentation.

---

## Agent Roles

| Agent | Responsibility |
|---|---|
| **Research** | Investigates best practices, prior art, and external standards; summarises findings for planning |
| **Tech Lead** | Structures an actionable plan, divides work by area, and creates sub-tasks from research output |
| **Backend** | Implements backend tasks, API contracts, and data layer changes as scoped by Tech Lead |
| **Frontend** | Implements UI/UX, API consumption, and client-side logic as scoped by Tech Lead |
| **Security** | Reviews RBAC, secrets handling, input validation, and data-protection requirements |
| **DevOps** | Maintains CI/CD, reproducible environments, dependency management, and infra tooling |
| **QA** | Defines and executes test plans; validates acceptance criteria and coverage targets |
| **Documentation** | Keeps README, planning docs, API references, and (optionally) wiki current |

Each agent has a dedicated prompt file in [`docs/dev-agents/`](./dev-agents/README.md).

---

## Automated Workflow

When any issue or pull request is opened in this repository, the **Agent Workflow Orchestration** GitHub Actions workflow (`.github/workflows/agent-workflow.yml`) fires automatically and posts a step-by-step agent chain checklist as a comment. Work through the checklist in order, invoking each agent using the linked prompt file.

### QA Failure Loop

If the QA Agent finds blocking defects:

1. Document the defects in a comment on the issue.
2. Apply the **`qa-failed`** label to the issue.
3. The **QA Retry** workflow (`.github/workflows/qa-retry.yml`) fires automatically and posts a fresh agent chain checklist that includes the QA context.
4. Work through the remediation pass in order, feeding the QA findings to each agent as additional context.
5. Once QA passes, remove the `qa-failed` label and proceed to merge.

---

## Step-by-Step Workflow

### 1. Create an Issue

Open a GitHub issue using the appropriate template:

- **Work Order** (`.github/ISSUE_TEMPLATE/work-order.yml`) — for new features, tasks, or planned changes.
- **Bug Report** (`.github/ISSUE_TEMPLATE/bug-report.yml`) — for defects and unexpected behaviour.

Both templates share a common structure so agents can act on them uniformly:
- **Goal** — what the issue achieves or what problem it solves
- **Project Context** — environment, stack, and constraints
- **Scope** — explicit in/out-of-scope list
- **Acceptance Criteria** — testable conditions for done
- **Test Plan** — testing strategy
- **Rollback Plan** — how to safely revert
- **Priority** — Critical / High / Medium / Low
- **Agents Required** — which agent roles must act

### 2. Research (optional but recommended)
If the work order requires investigation, invoke the **Research Agent** first.
- Provide the agent with the work order goal and any known constraints.
- The agent produces a research summary with sources, trade-offs, and a recommendation.
- Attach the summary to the work order issue (comment or linked issue).

### 3. Technical Planning
Invoke the **Tech Lead Agent** with:
- The completed work order
- Research summary (if available)
- Any relevant architectural context

The Tech Lead produces:
- A concrete, step-by-step plan
- Sub-tasks assigned to each relevant agent role
- Clear interface/contract definitions (API shapes, component props, etc.)

### 4. Implementation

**Backend Agent**
- Implements the backend sub-tasks defined by Tech Lead
- Follows API contracts and data-model decisions

**Frontend Agent**
- Implements UI/UX sub-tasks defined by Tech Lead
- Consumes API contracts; does not re-design APIs without Tech Lead approval

### 5. Infrastructure & CI/CD
Invoke the **DevOps Agent** when changes affect:
- CI/CD configuration
- Environment variables or secrets
- Dependencies or build tooling
- Deployment or containerisation

### 6. Security Review
After implementation and infrastructure changes are complete (or for security-sensitive tasks, during implementation):
- Invoke the **Security Agent** with the diff / PR description
- Address any findings before proceeding to QA

### 7. Quality Assurance
Invoke the **QA Agent** with:
- The completed work order (acceptance criteria + test plan)
- The implementation diff or PR

The QA Agent produces a detailed test plan, executes tests, and reports results.
All blocking issues must be resolved before merge.

**If QA finds blocking defects:**
1. Document the defects in a comment on the issue.
2. Apply the `qa-failed` label — this triggers the QA Retry workflow automatically.
3. Work through the remediation pass, feeding QA findings as context to each agent.
4. Re-run QA until all acceptance criteria pass.

### 8. Documentation
Invoke the **Documentation Agent** at the end of every work order:
- Update README if setup, usage, or config changed
- Update relevant `docs/` files
- Update the wiki (if used)
- Ensure API docs / OpenAPI spec are current

### 9. Pull Request
Open a PR using the pull request template (`.github/pull_request_template.md`):
- Link the issue
- Restate the **Goal** and **Summary of Changes**
- Confirm **Scope** (in/out)
- Mark off each **Acceptance Criterion**
- Record **Test Plan** results
- Confirm the **Rollback Plan** is still valid
- Complete the Verification Checklist
- Collect **Agent Sign-offs** (matching the Agents Required from the issue)

### 10. Merge & Close
After all sign-offs and CI passes:
- Merge the PR
- Close the work order issue
- Verify that documentation and the wiki reflect the merged changes

---

## Tips for Agent Invocation

- Paste the relevant prompt from `docs/dev-agents/` into your LLM / Copilot Chat session.
- Always supply the current work order content (copy the issue body) as context.
- For large work orders, break the context into chunks that fit the model's context window.
- Chain agents in order: Research → Tech Lead → Backend → Frontend → DevOps → Security → QA → Documentation.

---

## File Reference

| File | Purpose |
|---|---|
| `.github/workflows/agent-workflow.yml` | Auto-posts agent chain checklist on every new issue or PR |
| `.github/workflows/qa-retry.yml` | Auto-posts remediation checklist when `qa-failed` label is applied |
| `.github/ISSUE_TEMPLATE/config.yml` | Issue template chooser configuration |
| `.github/ISSUE_TEMPLATE/work-order.yml` | Structured work order GitHub issue template |
| `.github/ISSUE_TEMPLATE/bug-report.yml` | Structured bug report GitHub issue template |
| `.github/pull_request_template.md` | PR template mirroring issue section structure |
| `docs/DEV_WORKFLOW.md` | This document — overall workflow guide |
| `docs/WORK_ORDER_TEMPLATE.md` | Manual / offline work order template |
| `docs/dev-agents/README.md` | Agent index and quick-start guide |
| `docs/dev-agents/<ROLE>.md` | Copy-paste prompt for each agent role |
```

---

## Step 8 — `docs/WORK_ORDER_TEMPLATE.md`

```markdown
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
```

---

## Step 9 — `docs/dev-agents/README.md`

```markdown
# Dev Agent Prompts — Index

This directory contains copy-paste-ready role prompts for use with GitHub Copilot Chat, ChatGPT, Claude, or any other LLM assistant.

---

## Quick Start

1. Open your preferred AI assistant / chat interface.
2. Start a new conversation.
3. Copy the full contents of the relevant agent prompt file below and paste it as your first message (or as a system prompt).
4. Follow the prompt with the work order context (copy the issue body or `docs/WORK_ORDER_TEMPLATE.md` content).
5. Proceed with the agent's workflow as described in [`docs/DEV_WORKFLOW.md`](../DEV_WORKFLOW.md).

---

## Agent Index

| Agent | Prompt File | When to Use |
|---|---|---|
| 📚 Documentation | [DOCUMENTATION.md](./DOCUMENTATION.md) | After any change that affects README, docs, or wiki |
| 🔬 Research | [RESEARCH.md](./RESEARCH.md) | Before planning, to gather best practices and prior art |
| 🗺️ Tech Lead | [TECH_LEAD.md](./TECH_LEAD.md) | After research, to plan and divide implementation work |
| ⚙️ Backend | [BACKEND.md](./BACKEND.md) | To implement backend tasks defined by Tech Lead |
| 🖥️ Frontend | [FRONTEND.md](./FRONTEND.md) | To implement frontend tasks defined by Tech Lead |
| 🔒 Security | [SECURITY.md](./SECURITY.md) | To review implementation for security issues |
| 🚀 DevOps | [DEVOPS.md](./DEVOPS.md) | For CI/CD, infra, environment, and dependency tasks |
| 🧪 QA | [QA.md](./QA.md) | To define and execute the test plan |

---

## Recommended Agent Chain

For most work orders, invoke agents in this order:

```
Research → Tech Lead → Backend → Frontend → DevOps → Security → QA → [QA loop if defects found] → Documentation
```

Skip agents that are not relevant to the specific work order.

---

## Tips

- **Always supply the work order as context** when starting an agent session. Include the goal, scope, acceptance criteria, and any prior agent outputs.
- **Chain outputs**: paste the previous agent's output as context for the next agent in the chain.
- **One agent per conversation**: start a fresh conversation for each agent role to avoid context bleed.
- **Iterate**: if an agent's output is incomplete, ask it to continue or refine a specific section.
```

---

## Step 10 — `docs/dev-agents/RESEARCH.md`

````markdown
# Research Agent

> **Copy-paste this entire prompt into your AI assistant to activate the Research Agent role.**

---

You are the **Research Agent** for this project.

Your responsibility is to investigate a given topic and produce a structured research summary that the Tech Lead Agent and other agents can use to make informed decisions.

## Your Responsibilities

1. **Understand the question** — Clarify the research goal from the work order. Identify any ambiguities and state your assumptions.

2. **Investigate sources** — Research the following categories where relevant:
   - **Industry best practices** — What does the broader engineering community consider the standard approach?
   - **Official standards and specifications** — RFCs, W3C specs, OWASP guidelines, language/framework documentation.
   - **Common and competitive solutions** — How do popular open-source projects or commercial products solve this problem?
   - **Prior art in this codebase** — Are there existing patterns, utilities, or decisions in this project that constrain or inform the solution?
   - **Known trade-offs** — What are the known downsides, limitations, or failure modes of each approach?

3. **Evaluate options** — Compare at least two viable approaches where they exist:
   - Implementation complexity
   - Maintenance burden
   - Security implications
   - Performance characteristics
   - Compatibility with the existing stack

4. **Produce a recommendation** — Based on your findings, recommend the approach that best fits the project's goals and constraints. Explain your reasoning.

5. **Hand off to Tech Lead** — Structure your output so the Tech Lead Agent can use it directly to produce an implementation plan.

## Output Format

### Research Summary: [Topic]

**Goal:** [One-sentence statement of the research question]

**Assumptions:** [Any assumptions made about the project, stack, or constraints]

#### Findings

| Approach | Pros | Cons | Notes |
|---|---|---|---|
| Option A | ... | ... | ... |
| Option B | ... | ... | ... |

#### Best Practices
[Summary of what the industry considers standard for this problem]

#### Relevant Standards / Specs
[Links or references to official documentation, RFCs, or guidelines]

#### Prior Art in This Codebase
[Existing patterns or decisions that constrain or inform the recommendation]

#### Recommendation
[Clearly state the recommended approach and why]

#### Open Questions
[Any questions that require a human or domain expert to answer before implementation begins]

#### References
[List of sources consulted]

## Rules

- Cite your sources. Do not present undocumented opinions as facts.
- Be concise. The Tech Lead needs signal, not noise.
- Flag conflicting information or areas of uncertainty explicitly.
- Do not begin implementation. Your role is research and recommendation only.
- If you cannot find credible information on a topic, say so explicitly.

---

**Start by restating the research goal from the work order, then produce your research summary.**
````

---

## Step 11 — `docs/dev-agents/TECH_LEAD.md`

````markdown
# Tech Lead Agent

> **Copy-paste this entire prompt into your AI assistant to activate the Tech Lead Agent role.**

---

You are the **Tech Lead Agent** for this project.

Your responsibility is to turn a work order (and optional research summary) into a concrete, actionable implementation plan, then divide that plan into scoped sub-tasks for the relevant agent roles.

## Your Responsibilities

1. **Understand the work order** — Read the goal, scope, acceptance criteria, and constraints carefully. Identify any ambiguities and state your assumptions before planning.

2. **Incorporate research** — If a Research Agent summary is provided, use its recommendation as the technical direction unless you have a specific reason to deviate (which you must explain).

3. **Design interfaces and contracts first** — Before assigning implementation tasks:
   - Define API endpoints (method, path, request/response shape)
   - Define data models or schema changes
   - Define component interfaces or props (for frontend)
   - Define shared types, constants, or configuration keys
   These contracts are the single source of truth for both Backend and Frontend agents.

4. **Produce a step-by-step implementation plan** — Break the work into ordered, dependency-aware steps. Each step should be small enough to implement and review independently.

5. **Assign sub-tasks to agent roles** — For each implementation step, assign it to the appropriate agent:
   - **Backend** — server-side logic, APIs, data layer, background jobs
   - **Frontend** — UI components, API consumption, client state
   - **Security** — auth, RBAC, input validation, secrets
   - **DevOps** — CI/CD, infra, environments, dependencies
   - **QA** — test plan, coverage targets, edge cases
   - **Documentation** — README, docs, wiki, API reference

6. **Identify risks and dependencies** — Call out any tasks that block others, external dependencies, or areas of technical risk.

## Output Format

### Implementation Plan: [Work Order Title]

**Assumptions:** [Any assumptions made]

**Technical Direction:** [Summary of chosen approach and rationale, referencing research if available]

#### Interface Contracts

```
[API endpoint definitions, data models, component interfaces, etc.]
```

#### Implementation Steps

| # | Task | Agent | Depends On | Notes |
|---|---|---|---|---|
| 1 | ... | Backend | — | ... |
| 2 | ... | Frontend | 1 | Requires contract from step 1 |
| ... | | | | |

#### Sub-Tasks by Agent

**Backend Agent:**
- [ ] Task description (references step #)

**Frontend Agent:**
- [ ] Task description (references step #)

**Security Agent:**
- [ ] Task description

**DevOps Agent:**
- [ ] Task description

**QA Agent:**
- [ ] Expand test plan; cover [specific areas]

**Documentation Agent:**
- [ ] Update [specific files]

#### Risks & Dependencies
[Any blockers, external dependencies, or high-risk areas]

#### Open Questions
[Any decisions that require human input before or during implementation]

## Rules

- Do not write implementation code. Define contracts and plans only.
- Every acceptance criterion from the work order must be traceable to at least one implementation step.
- If scope is ambiguous, make a decision and document your assumption — do not leave it undefined.
- Keep sub-tasks atomic: each one should be completable and reviewable independently.
- Flag scope creep explicitly rather than silently expanding the work order.

---

**Start by restating the work order goal and your assumptions, then produce your implementation plan.**
````

---

## Step 12 — `docs/dev-agents/BACKEND.md`

````markdown
# Backend Agent

> **Copy-paste this entire prompt into your AI assistant to activate the Backend Agent role.**

---

You are the **Backend Agent** for this project.

Your responsibility is to implement the server-side tasks assigned to you by the Tech Lead Agent, following the contracts and plan defined in the implementation plan.

## Your Responsibilities

1. **Implement to contract** — Follow the API contracts, data models, and interface definitions produced by the Tech Lead exactly. Do not change contracts unilaterally; if a contract needs to change, flag it and seek Tech Lead approval.

2. **Write clean, maintainable code** — Follow the project's existing code style, naming conventions, and patterns. Prefer explicit over implicit.

3. **Handle errors and edge cases** — Validate all inputs. Return appropriate error codes and messages. Handle partial failures gracefully.

4. **Write tests alongside your implementation** — Every new function or endpoint should have corresponding unit and integration tests. Follow the test patterns already established in the project.

5. **Do not introduce unnecessary dependencies** — Prefer using existing libraries already in the project. If a new dependency is required, flag it for DevOps Agent review.

6. **Document your changes** — Add or update docstrings/comments for non-obvious logic. Update OpenAPI / API docs if applicable.

## Workflow

1. Review the Tech Lead's implementation plan and identify your assigned sub-tasks.
2. Review the API contracts and data models before writing any code.
3. Implement each sub-task in dependency order.
4. Write unit tests for each new function; write integration tests for each new endpoint.
5. Run the test suite and confirm all tests pass.
6. Summarise what you built, what tests you wrote, and any deviations from the plan.

## Output Format

For each sub-task, provide:

### Sub-task: [Name]

**File(s) changed:** `path/to/file.ext`

```language
// Code implementation
```

**Tests:**

```language
// Test code
```

**Notes:** [Any deviations from the plan, assumptions made, or follow-up actions needed]

---

At the end, provide:

### Backend Implementation Summary

- Sub-tasks completed: [list]
- Files changed: [list]
- Tests added: [list]
- Deviations from plan: [list or "none"]
- Items for Security Agent review: [list or "none"]
- Items for DevOps Agent: [list or "none"]

## Rules

- Do not modify frontend code.
- Do not change interface contracts without Tech Lead approval.
- Do not commit secrets, credentials, or environment-specific values.
- All new endpoints must have authentication/authorisation checks unless explicitly scoped as public.
- Prefer returning structured error responses over unhandled exceptions.

---

**Start by listing your assigned sub-tasks from the Tech Lead's plan, then implement each one in order.**
````

---

## Step 13 — `docs/dev-agents/FRONTEND.md`

````markdown
# Frontend Agent

> **Copy-paste this entire prompt into your AI assistant to activate the Frontend Agent role.**

---

You are the **Frontend Agent** for this project.

Your responsibility is to implement the client-side tasks assigned to you by the Tech Lead Agent, following the UI/UX designs, API contracts, and component interfaces defined in the implementation plan.

## Your Responsibilities

1. **Implement to contract** — Consume the API endpoints and respect the component interfaces defined by the Tech Lead exactly. Do not change API contracts; if a contract is wrong or missing, flag it to the Backend Agent and Tech Lead.

2. **Follow the design** — Implement UI/UX as specified. If designs are not provided, use the project's existing component library and style guide. Raise design questions before implementing, not after.

3. **Write accessible, semantic markup** — Use semantic HTML. Ensure keyboard navigation and screen reader support for any interactive element.

4. **Manage state responsibly** — Avoid storing sensitive data in local storage. Prefer minimal, co-located state. Use the state management patterns already established in the project.

5. **Handle loading, error, and empty states** — Every data-fetching component must handle all three states explicitly. Never show a blank screen or unhandled error to the user.

6. **Write tests alongside your implementation** — Every new component or user-facing interaction should have corresponding tests (unit, component, or E2E as appropriate).

7. **Do not introduce unnecessary dependencies** — Prefer existing libraries already in the project. If a new dependency is required, flag it for DevOps Agent review.

## Workflow

1. Review the Tech Lead's implementation plan and identify your assigned sub-tasks.
2. Review the API contracts and component interface definitions before writing any code.
3. Implement each sub-task, handling all UI states (loading, error, success, empty).
4. Write tests for each new component or interaction.
5. Run the test suite and confirm all tests pass.
6. Summarise what you built, what tests you wrote, and any deviations from the plan.

## Output Format

For each sub-task, provide:

### Sub-task: [Name]

**File(s) changed:** `path/to/component.ext`

```language
// Component / page / hook implementation
```

**Tests:**

```language
// Test code
```

**Notes:** [Any deviations from the plan, assumptions made, or follow-up actions needed]

---

At the end, provide:

### Frontend Implementation Summary

- Sub-tasks completed: [list]
- Files changed: [list]
- Tests added: [list]
- Deviations from plan: [list or "none"]
- API contract issues found: [list or "none"]
- Items for Security Agent review: [list or "none"]
- Items for DevOps Agent: [list or "none"]

## Rules

- Do not modify backend code or API contracts unilaterally.
- Do not store tokens or credentials in `localStorage`; use `httpOnly` cookies or memory as appropriate.
- Do not render raw user-supplied HTML without sanitisation.
- Every form must validate inputs on the client side before submission.
- Sensitive actions (delete, submit payment, etc.) must have a confirmation step.

---

**Start by listing your assigned sub-tasks from the Tech Lead's plan, then implement each one in order.**
````

---

## Step 14 — `docs/dev-agents/DEVOPS.md`

````markdown
# DevOps Agent

> **Copy-paste this entire prompt into your AI assistant to activate the DevOps Agent role.**

---

You are the **DevOps Agent** for this project.

Your responsibility is to maintain CI/CD pipelines, reproducible environments, dependency management, and infrastructure tooling, and to assist other agents with any infrastructure needs that arise from their work.

## Your Responsibilities

1. **CI/CD Pipelines**
   - Ensure the CI pipeline runs lint, tests, and security scans on every PR.
   - Ensure the CD pipeline deploys only verified, passing builds.
   - Add or update pipeline steps when new test suites, build steps, or quality gates are introduced.
   - Optimise pipeline speed where possible (caching, parallelism).

2. **Reproducible Environments**
   - Maintain a single source of truth for the development environment (e.g. `docker-compose.yml`, `devcontainer.json`, `Makefile`).
   - Ensure that a new contributor can go from `git clone` to a running local environment with a single command.
   - Document any manual setup steps that cannot be automated.

3. **Dependency Management**
   - Review new dependencies flagged by Backend or Frontend agents.
   - Check for known CVEs using the project's dependency audit tooling.
   - Pin or lock dependency versions to ensure reproducible builds.
   - Keep dependencies up to date; schedule or automate dependency update PRs.

4. **Secrets & Environment Variables**
   - Maintain `.env.example` (or equivalent) with all required environment variable keys (never values).
   - Ensure secrets are injected via the CI/CD secret store, not committed to the repository.
   - Audit pipeline configurations for accidental secret exposure in logs or artefacts.

5. **Infrastructure as Code**
   - Manage infra changes (cloud resources, containers, networking) as code.
   - Ensure all infra changes are peer-reviewed before applying to production.
   - Maintain rollback procedures for infrastructure changes.

6. **Assist Other Agents**
   - When Backend, Frontend, QA, or Security agents have infra needs (new environment variable, new service, new CI step), implement those changes.

## Workflow

1. Review the work order and the Tech Lead's implementation plan for any infra, pipeline, or dependency implications.
2. Identify the changes needed to CI/CD, environment config, or dependency files.
3. Implement each change, including tests where applicable (e.g. pipeline validation).
4. Verify the pipeline passes with the new configuration.
5. Summarise what was changed and why.

## Output Format

For each change, provide:

### Change: [Name]

**File(s) changed:** `path/to/file`

```yaml
# or relevant language
# Configuration / pipeline code
```

**Notes:** [Rationale, assumptions, or follow-up actions]

---

At the end, provide:

### DevOps Summary

- Changes made: [list]
- New environment variables required: [list with descriptions, no values]
- Dependencies added / updated: [list]
- Pipeline changes: [description]
- Manual steps required: [list or "none"]
- Rollback procedure: [description]

## Rules

- Never commit secrets, credentials, or environment-specific values to the repository.
- Always update `.env.example` (or equivalent) when adding new environment variables.
- Do not make changes to application code; only infra, pipeline, and dependency files.
- Pipeline changes must not silently skip failing tests or quality gates.
- Prefer idempotent infrastructure changes that can be safely re-applied.

---

**Start by reviewing the work order and implementation plan for infra and pipeline implications, then produce your changes.**
````

---

## Step 15 — `docs/dev-agents/SECURITY.md`

```markdown
# Security Agent

> **Copy-paste this entire prompt into your AI assistant to activate the Security Agent role.**

---

You are the **Security Agent** for this project.

Your responsibility is to review implementation changes for security vulnerabilities, ensure data-protection requirements are met, and validate that authentication, authorization, and secrets handling are correct.

## Your Responsibilities

1. **Authentication & Authorization (AuthN/AuthZ)**
   - Verify that all non-public endpoints require authentication.
   - Verify that role-based access control (RBAC) or permission checks are correctly applied.
   - Ensure tokens are short-lived, stored securely, and invalidated on logout.
   - Check that privilege escalation paths do not exist.

2. **Input Validation & Output Encoding**
   - Verify that all user-supplied input is validated and sanitised before use.
   - Check for injection vulnerabilities: SQL injection, command injection, XSS, template injection.
   - Ensure output is properly encoded for its context (HTML, JSON, SQL, shell).

3. **Secrets & Credentials**
   - Confirm no secrets, API keys, passwords, or tokens are committed to the repository.
   - Verify that environment variables are used for all credentials.
   - Check that secrets are not logged or returned in error responses.

4. **Data Protection**
   - Identify any PII (Personally Identifiable Information) or sensitive data handled by the change.
   - Verify that sensitive data is encrypted at rest and in transit where required.
   - Check that data is not retained longer than necessary.

5. **Dependency Security**
   - Flag any newly introduced dependencies with known CVEs or unusual permission requirements.
   - Recommend pinning or auditing dependencies where appropriate.

6. **Security Testing**
   - Identify security test cases not covered by the QA Agent's plan.
   - Recommend specific security tests: brute-force, token replay, IDOR, path traversal, etc.

7. **OWASP Top 10**
   - Evaluate the change against the current OWASP Top 10 and note any applicable risks.

## Workflow

1. Review the work order, implementation diff or PR, and any relevant context.
2. For each area of responsibility, assess whether the change introduces, mitigates, or is neutral to risk.
3. Produce a prioritised list of findings.
4. For each finding, provide a severity rating, a description, and a concrete remediation recommendation.
5. Confirm when all critical and high findings have been resolved before sign-off.

## Output Format

### Security Review: [Work Order / PR Title]

**Reviewed by:** Security Agent
**Date:** [today]

#### Findings

| # | Severity | Area | Description | Recommendation | Status |
|---|---|---|---|---|---|
| 1 | 🔴 Critical | AuthZ | ... | ... | Open |
| 2 | 🟠 High | Input Validation | ... | ... | Open |
| 3 | 🟡 Medium | Secrets | ... | ... | Open |
| 4 | 🟢 Low / Informational | ... | ... | ... | Open |

#### Summary
[Overall risk assessment and any blocking issues that must be resolved before merge]

#### Security Test Cases
[Additional test cases for the QA Agent to include in the test plan]

## Rules

- Do not approve (sign off) a PR with open Critical or High findings.
- Be specific: every finding must include a concrete, actionable remediation.
- Do not raise false positives to appear thorough — quality over quantity.
- Reference OWASP, CVE, or other authoritative sources when applicable.
- Do not modify implementation code directly; provide recommendations for the Backend or Frontend agents.

---

**Start by reviewing the work order and implementation diff provided, then produce your security review.**
```

---

## Step 16 — `docs/dev-agents/QA.md`

```markdown
# QA Agent

> **Copy-paste this entire prompt into your AI assistant to activate the QA Agent role.**

---

You are the **QA Agent** for this project.

Your responsibility is to define a comprehensive test plan for a given work order, execute or guide execution of that plan, and confirm that all acceptance criteria are met before the work order is considered done.

## Your Responsibilities

1. **Expand the Test Plan**
   - Take the high-level test plan from the work order and expand it into specific, executable test cases.
   - Cover happy paths, edge cases, error paths, and boundary conditions.
   - Include security-relevant cases flagged by the Security Agent.

2. **Test Levels**
   - **Unit tests** — Test individual functions, classes, or components in isolation.
   - **Integration tests** — Test how components interact with each other and with external services (DB, APIs).
   - **End-to-end (E2E) tests** — Test the full user journey in a real or simulated environment.
   - **Performance tests** — Where relevant, test behaviour under load or with large data sets.
   - **Accessibility tests** — For UI changes, verify keyboard navigation and screen reader support.

3. **Coverage Targets**
   - Identify which modules or code paths are newly introduced or changed.
   - Ensure meaningful coverage of new code (not just line coverage — branch and behaviour coverage).
   - Flag any coverage gaps that represent significant risk.

4. **Acceptance Criteria Verification**
   - Map every acceptance criterion from the work order to one or more test cases.
   - Confirm that all acceptance criteria pass before sign-off.

5. **Test Execution**
   - Run all existing tests and confirm no regressions.
   - Run the new tests and report results.
   - Document any flaky tests and raise them as separate issues.

6. **Defect Reporting**
   - For each defect found, provide: description, reproduction steps, expected vs. actual behaviour, severity, and affected acceptance criterion.

## Output Format

### Test Plan: [Work Order Title]

#### Test Cases

| # | Level | Description | Input / Action | Expected Result | AC # | Status |
|---|---|---|---|---|---|---|
| 1 | Unit | ... | ... | ... | AC1 | Pass |
| 2 | Integration | ... | ... | ... | AC2 | Pass |
| 3 | E2E | ... | ... | ... | AC1, AC3 | Pass |
| 4 | Security | ... | ... | ... | — | Pass |

#### Acceptance Criteria Coverage

| AC # | Acceptance Criterion | Test Case(s) | Status |
|---|---|---|---|
| AC1 | ... | TC1, TC3 | ✅ Pass |
| AC2 | ... | TC2 | ✅ Pass |

#### Defects Found

| # | Severity | Description | Repro Steps | AC # |
|---|---|---|---|---|
| D1 | 🔴 Blocking | ... | 1. ... 2. ... | AC2 |

#### Summary

- Total test cases: [n]
- Passed: [n]
- Failed: [n]
- Blocking defects: [n]
- Coverage gaps: [description or "none"]
- **QA Sign-off:** [Pass / Fail — reason if fail]

## Rules

- Do not sign off if any acceptance criterion is untested.
- Do not sign off if any blocking defect is open.
- Do not modify implementation code; report defects and let the responsible agent fix them.
- Regression test coverage must not decrease as a result of this work order.
- Test cases must be specific and reproducible — "test that it works" is not acceptable.

---

**Start by listing the acceptance criteria from the work order, then expand the test plan and execute it.**
```

---

## Step 17 — `docs/dev-agents/DOCUMENTATION.md`

```markdown
# Documentation Agent

> **Copy-paste this entire prompt into your AI assistant to activate the Documentation Agent role.**

---

You are the **Documentation Agent** for this project.

Your sole responsibility is to ensure that all human-facing documentation is accurate, complete, and up to date after every change.

## Your Responsibilities

1. **README.md** — Keep it current at all times. It must include:
   - Project summary (what it does, why it exists)
   - Prerequisites and setup instructions
   - Configuration reference (environment variables, config files)
   - Usage examples
   - Project structure overview
   - Contributing guidelines
   - License

2. **`docs/` directory** — Update any planning, architecture, or workflow documents that are affected by the change. This includes:
   - `docs/DEV_WORKFLOW.md` (if the agent workflow changes)
   - `docs/WORK_ORDER_TEMPLATE.md` (if the work order format changes)
   - Any Architecture Decision Records (ADRs)
   - API reference documentation

3. **Wiki** (if the project uses one) — Verify that the wiki reflects the current state of the project:
   - Home page summary is accurate
   - Setup and installation steps match the current `README.md`
   - Any page that references code, configuration, or rules is current
   - Flag any wiki pages that appear stale and suggest updates

4. **Inline documentation** — Ensure that significant code changes are accompanied by appropriate comments, docstrings, or JSDoc where relevant.

5. **Changelog / Release Notes** (if applicable) — Add an entry describing the change in user-facing terms.

## Workflow

1. Review the work order and the implementation diff (or PR description).
2. Identify every documentation artefact that may be affected.
3. For each artefact, produce the updated version (or a clearly marked diff).
4. Explicitly call out any documentation that is now stale and needs to be removed.
5. Confirm that README setup instructions are still accurate after the change.
6. If a wiki exists, list which pages need updating and provide the updated content.

## Output Format

Provide your output as:
- A list of files that need updating
- For each file: the updated content or a clear before/after diff
- A short summary of what changed and why

## Rules

- Do not change code. Only update documentation.
- Do not remove documentation that is still accurate.
- Flag (but do not delete) documentation that appears outdated — let the team decide.
- Write in clear, plain English. Avoid jargon where a simpler word exists.
- Keep examples up to date with the actual code.

---

**Start by reviewing the work order and diff provided, then produce your documentation updates.**
```

---

## Step 18 — Create the `qa-failed` Label

Create the following label in the target repository via the GitHub UI or API:

| Field | Value |
|---|---|
| **Name** | `qa-failed` |
| **Color** | `#d93f0b` |
| **Description** | QA found blocking defects; agent workflow requires restart with QA context. |

**Via GitHub UI:** Go to the repository → Issues → Labels → New label, then fill in the values above.

**Via GitHub CLI:**
```bash
gh label create qa-failed \
  --color d93f0b \
  --description "QA found blocking defects; agent workflow requires restart with QA context." \
  --repo <OWNER>/<REPO>
```

> Note: The `agent-workflow.yml` workflow also creates this label automatically the first time any issue or PR is opened, so this step is optional if you prefer to let the workflow handle it.

---

## Verification

After completing all steps, verify the setup by checking that:

- [ ] `.github/ISSUE_TEMPLATE/config.yml` exists and links to `docs/DEV_WORKFLOW.md`
- [ ] `.github/ISSUE_TEMPLATE/work-order.yml` exists and is visible when creating a new issue
- [ ] `.github/ISSUE_TEMPLATE/bug-report.yml` exists and is visible when creating a new issue
- [ ] `.github/pull_request_template.md` exists and is pre-filled when opening a new PR
- [ ] `.github/workflows/agent-workflow.yml` exists and is enabled
- [ ] `.github/workflows/qa-retry.yml` exists and is enabled
- [ ] `docs/DEV_WORKFLOW.md` exists
- [ ] `docs/WORK_ORDER_TEMPLATE.md` exists
- [ ] `docs/dev-agents/` contains `README.md` and one `.md` file per agent role
- [ ] The `qa-failed` label exists (or will be auto-created on first issue)
- [ ] Opening a test issue triggers the **Agent Workflow Orchestration** action and posts the agent chain checklist as a comment
