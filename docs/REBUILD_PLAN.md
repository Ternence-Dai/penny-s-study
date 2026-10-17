# Rebuild plan — 天文竞赛智能学习平台

## Product intent

An evidence-based astronomy learning environment combining structured curriculum, question banks, worked solutions, spaced practice, learner progress, and an AI tutor grounded in curated content.

## Target capabilities

1. Curriculum map and astronomy knowledge graph
2. Versioned question bank with difficulty and topic tags
3. Timed practice, answer sheets, and review workflows
4. Step-by-step explanations with source references
5. Adaptive practice and spaced repetition
6. Learner progress, weak-topic diagnosis, and teacher tools

## Non-negotiable correctness and safety gates

Questions and answer keys require provenance and review status. Separate verified content from generated suggestions; test scoring, timing, randomization, and accessibility.

## Delivery sequence

1. Inventory current behavior, assets, data formats, and dependencies.
2. Define domain model, API contracts, permissions, and migration/import strategy.
3. Implement the smallest end-to-end vertical slice with typed interfaces.
4. Add unit, integration, and browser-level tests for critical workflows.
5. Add CI, security/dependency scanning, and reproducible build instructions.
6. Validate with reference datasets and document known limitations.
7. Review deployment, backup, recovery, and release process before production use.

## Open-source adoption policy

For each dependency or reference project, record its repository URL, license, maintenance activity, security posture, exact component being reused or adapted, and attribution obligations. Prefer stable standards and small interoperable components over copying whole applications.

## Status

- [ ] Existing repository and data audit complete
- [ ] Domain model and architecture approved
- [ ] Core vertical slice implemented
- [ ] Critical workflows tested
- [ ] CI and security checks passing
- [ ] Deployment and backup procedure verified
- [ ] Release candidate reviewed
