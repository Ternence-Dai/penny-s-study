# Astronomy Competition Learning Platform

> 天文竞赛智能学习平台

An evidence-based astronomy learning environment combining structured curriculum, question banks, worked solutions, spaced practice, learner progress, and an AI tutor grounded in curated content.

## Product modules

- Curriculum map and astronomy knowledge graph
- Versioned question bank with difficulty and topic tags
- Timed practice, answer sheets, and review workflows
- Step-by-step explanations with source references
- Adaptive practice and spaced repetition
- Learner progress, weak-topic diagnosis, and teacher tools

## Engineering principles

Questions and answer keys require provenance and review status. Separate verified content from generated suggestions; test scoring, timing, randomization, and accessibility.

- Modular, typed, documented code; no monolithic application entry point.
- Reproducible setup, deterministic tests, and automated quality checks.
- Secure configuration: secrets belong in environment variables or managed secret stores, never in source control.
- Accessible, responsive interface with clear loading, empty, error, and offline states.
- Open-source components are evaluated for maintenance, license compatibility, security, and fit before adoption.

## Delivery status

The modernization work is being applied directly to `main`. The current baseline includes a domain-core module, automated domain tests, standalone-app validation, and a GitHub Pages deployment workflow. These checks passing confirms the current baseline is buildable; it does **not** mean the full product rebuild is complete.

Remaining delivery work includes validating the existing application workflows and data, extracting maintainable modules from the legacy entry point, adding migration-safe persistence and import/export checks, and documenting verified domain rules. Existing user data and the legacy application must be preserved while these changes are introduced.

See [the rebuild plan](docs/REBUILD_PLAN.md).
