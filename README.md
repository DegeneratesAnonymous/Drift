# AI Agent Template

A repository template for multi-agent AI-driven development workflows — ready to copy into any project or use as the base for a new repo.

## Overview

This template provides a structured foundation for teams (human or AI) that use specialised agent roles to plan, build, test, and document software.
It includes GitHub issue and PR templates, a step-by-step dev workflow guide, and copy-paste-ready role prompts for use with GitHub Copilot Chat, ChatGPT, Claude, or any other LLM assistant.

## Agent Roles

| Agent | Responsibility |
|---|---|
| 📚 Documentation | Keeps README, docs, and wiki current |
| 🔬 Research | Investigates best practices and prior art |
| 🗺️ Tech Lead | Plans work and divides tasks across roles |
| ⚙️ Backend | Implements server-side logic and APIs |
| 🖥️ Frontend | Implements UI/UX and API consumption |
| 🔒 Security | Reviews AuthN/AuthZ, secrets, and data protection |
| 🚀 DevOps | Manages CI/CD, environments, and dependencies |
| 🧪 QA | Defines and executes test plans |

## Quick Start

### 1. Use this template

Click **Use this template** on GitHub to create a new repository, or clone and copy the files into an existing project.

> **Configuring an existing repository?** See [`docs/REPO_SETUP_GUIDE.md`](docs/REPO_SETUP_GUIDE.md) — a step-by-step guide with all file contents included, ready to hand to an AI assistant.

### 2. Open an Issue

Create a new issue using the **Work Order** template for planned features or the **Bug Report** template for defects. Fill in every required field — both templates share the same structure (Goal, Scope, Acceptance Criteria, Test Plan, Rollback Plan, Agents Required) so agents can act on them autonomously.

> **Need a reference?** See [`docs/EXAMPLE_ISSUE.md`](docs/EXAMPLE_ISSUE.md) for a fully filled-in Work Order example.

### 3. Invoke agents

When you open an issue or pull request, the **Agent Workflow Orchestration** action automatically posts a step-by-step agent chain checklist as a comment. For each step, open the linked prompt file from [`docs/dev-agents/`](docs/dev-agents/README.md), paste it into your AI assistant, and follow up with the work order content.

Recommended order:
```
Research → Tech Lead → Backend → Frontend → DevOps → Security → QA → [QA loop if defects found] → Documentation
```

### 4. Open a PR

Use the pull request template to link the work order, complete the verification checklist, and collect agent sign-offs before merging.

> **Need a reference?** See [`docs/EXAMPLE_PR.md`](docs/EXAMPLE_PR.md) for a fully filled-in PR example.

## File Reference

| File / Directory | Purpose |
|---|---|
| `.github/workflows/agent-workflow.yml` | Auto-posts agent chain checklist on every new issue or PR |
| `.github/workflows/qa-retry.yml` | Auto-posts remediation checklist when `qa-failed` label is applied |
| `.github/ISSUE_TEMPLATE/config.yml` | Issue template chooser configuration |
| `.github/ISSUE_TEMPLATE/work-order.yml` | Structured GitHub issue template for work orders |
| `.github/ISSUE_TEMPLATE/bug-report.yml` | Structured GitHub issue template for bug reports |
| `.github/pull_request_template.md` | PR template mirroring issue section structure |
| `docs/DEV_WORKFLOW.md` | Full step-by-step workflow guide |
| `docs/REPO_SETUP_GUIDE.md` | Agent-ready guide for configuring an existing repo to use this workflow |
| `docs/WORK_ORDER_TEMPLATE.md` | Manual / offline work order template |
| `docs/EXAMPLE_ISSUE.md` | Fully filled-in example Work Order issue (reference for writing your own) |
| `docs/EXAMPLE_PR.md` | Fully filled-in example pull request (reference for writing your own) |
| `docs/dev-agents/README.md` | Agent index and quick-usage guide |
| `docs/dev-agents/<ROLE>.md` | Copy-paste prompt for each agent role |
| `learning-data/` | Reference documents agents can consult for domain knowledge and project context |

## Project Structure

```
AIAgentTemplate/
├── .github/
│   ├── workflows/
│   │   ├── agent-workflow.yml   # Auto-posts agent chain checklist on new issues/PRs
│   │   └── qa-retry.yml         # Auto-posts remediation checklist on qa-failed label
│   ├── ISSUE_TEMPLATE/
│   │   ├── config.yml           # Issue template chooser configuration
│   │   ├── work-order.yml       # Work order issue template
│   │   └── bug-report.yml       # Bug report issue template
│   └── pull_request_template.md # PR template mirroring issue section structure
├── docs/
│   ├── DEV_WORKFLOW.md          # Step-by-step workflow guide
│   ├── REPO_SETUP_GUIDE.md      # Agent-ready guide to configure an existing repo
│   ├── WORK_ORDER_TEMPLATE.md   # Manual work order template
│   ├── EXAMPLE_ISSUE.md         # Filled-in example Work Order issue
│   ├── EXAMPLE_PR.md            # Filled-in example pull request
│   └── dev-agents/
│       ├── README.md            # Agent index and quick start
│       ├── DOCUMENTATION.md     # Documentation Agent prompt
│       ├── RESEARCH.md          # Research Agent prompt
│       ├── TECH_LEAD.md         # Tech Lead Agent prompt
│       ├── BACKEND.md           # Backend Agent prompt
│       ├── FRONTEND.md          # Frontend Agent prompt
│       ├── SECURITY.md          # Security Agent prompt
│       ├── DEVOPS.md            # DevOps Agent prompt
│       └── QA.md                # QA Agent prompt
├── learning-data/
│   └── README.md                # Guidance on storing agent reference documents
└── README.md
```

## Contributing

Pull requests are welcome. For major changes, please open a Work Order issue first to discuss what you would like to change.

## License

[MIT](LICENSE)
