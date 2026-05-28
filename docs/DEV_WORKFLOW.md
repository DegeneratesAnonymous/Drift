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
