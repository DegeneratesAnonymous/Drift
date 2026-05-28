# Learning Data

This folder stores reference documents that AI agents can consult during the development workflow.

## Purpose

Place any documents here that should inform agent behaviour or provide background knowledge for your project.  Examples include:

- Domain glossaries and terminology guides
- Architecture decision records (ADRs)
- API contracts and data-model references
- Style guides and coding standards
- Research notes and prior-art summaries
- Business rules and compliance requirements

## Usage

When invoking an agent, reference the relevant file(s) from this folder in your prompt.  For example:

> "See `learning-data/domain-glossary.md` for project-specific terminology before beginning."

Agents can then use these documents as grounding context to produce more accurate and consistent outputs.

## Adding Documents

1. Place your document in this folder (subdirectories are welcome for organization).
2. Use descriptive file names, e.g. `api-contract-v2.md` or `architecture-decisions.md`.
3. Update this `README.md` if you add a subdirectory so that agents can discover it quickly.
