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
