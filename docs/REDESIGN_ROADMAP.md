# 星赛通 — Deep Redesign Roadmap

> Status: discovery and learning-product baseline. Keep the current content and question bank until coverage and correctness are audited.

## Product vision
Evolve the current astronomy learning experience into an adaptive learning studio for astronomy concepts, observation skills, and competition preparation.

## Product pillars
1. **Knowledge map** — astronomy topics, prerequisite graph, misconceptions, and learning objectives.
2. **Adaptive practice** — spaced repetition, mastery estimates, difficulty calibration, and targeted review.
3. **Competition mode** — timed rounds, topic-specific drills, explanations, and performance analysis.
4. **AI tutor** — Socratic hints, step-by-step reasoning, and source-grounded explanations.
5. **Observation lab** — sky events, coordinate concepts, observation logs, and interactive simulations where data sources are verified.

## Proposed architecture
- Frontend: TypeScript + React/Vite, responsive learning workspace and accessible interactive diagrams.
- Content: versioned question schema with answer rationale, difficulty, topic tags, references, and review status.
- Learning engine: deterministic scheduling/mastery algorithms with tests and explainable recommendations.
- AI: retrieval over reviewed content; tutor outputs distinguish sourced facts from generated explanations.
- Analytics: learner progress and item-quality metrics with privacy-conscious storage.

## Redesign workstreams
### P0 — content integrity
- Inventory all existing lessons, questions, answers, formulas, diagrams, and scoring logic.
- Detect duplicates, ambiguous wording, outdated facts, and unsupported answer keys.
- Add source/reference and last-reviewed fields to scientific content.
- Remove unnecessary personal email/contact metadata from public pages.

### P1 — learning engine
- Define Learner, Topic, Skill, Question, Attempt, ReviewSchedule, LearningSession.
- Implement baseline spaced-repetition scheduling and mastery tracking with deterministic tests.
- Separate practice, mock competition, and exploration progress.
- Support user export/reset and clear data controls.

### P2 — learning experience
- Redesign around Learn / Practice / Competition / Sky Lab / Progress.
- Add focused study sessions, hints before solutions, error notebooks, and visual explanations.
- Provide accessible charts and keyboard-friendly quiz interactions.
- Optimize for mobile study and low-friction resume.

### P3 — evidence-grounded AI tutor
- Retrieve only from reviewed content and cited trusted references.
- Encourage reasoning before revealing answers; explain incorrect options.
- Add content feedback and educator review workflow.
- Evaluate hallucination, answer correctness, and age-appropriate safety before release.

## Acceptance criteria
- Every scored question has a reviewed answer key and explanation.
- Scheduling and scoring algorithms have deterministic unit tests.
- Learning progress is reproducible and exportable.
- AI tutor can state uncertainty and expose supporting sources.
- Critical learning and competition flows pass Playwright tests.

## Non-goals / safeguards
- No fabricated astronomical facts or unsourced event predictions.
- No opaque ranking of learners.
- No replacement of reviewed content with unverified AI-generated questions.
