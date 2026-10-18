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

The modernization work is being applied directly to `main`. The verified grading slice has one pure rules engine for single-choice, true/false, image-choice, multi-select, fill-in, and ordering questions. Multi-select uses typed multiset equality; fill-in normalization accepts equivalent ASCII and prime-symbol arcminute/arcsecond notation; ordering requires an exact sequence. Question-bank structure, selected content corrections, blank-attempt statistics, and storage recovery have automated checks. The offline formula tutor is rule-based and does not call a live LLM. Build, tests, and Pages deployment pass.

Remaining delivery work includes source-backed review of the full astronomy question bank and answer explanations, broader timed-exam and teacher workflows, accessibility/browser testing, and a reviewed content-update process. Do not treat generated or unreviewed content as a verified answer key.

See [the rebuild plan](docs/REBUILD_PLAN.md) and [domain rules, units and validation boundaries](docs/DOMAIN_CORE.md).
