# 00 - Product Vision

## Product name

Evidence-Grounded Multi-Model Long-Horizon Research Workbench

Short internal name:

```text
Research Workbench
```

## One-sentence definition

A local-first web application where multiple AI models collaboratively research, critique, revise, and finalize ideas through evidence, counter-evidence, structured deliberation, and long-horizon memory.

## What this is not

This is not a multi-chat UI.

This is not an app that simply sends the same prompt to ChatGPT, Claude, DeepSeek, or local models and displays their answers side by side.

This is not a one-shot research assistant.

This is not a browser automation tool.

The system is a structured research operating environment. The central objects are claims, evidence, critiques, decisions, revisions, context manifests, and raw immutable events.

## Primary user problem

When developing a project idea, users often ask several AI models separately. The models produce different, sometimes contradictory answers. One model may call an idea strong; another may reject it. The user must manually copy answers, ask one model to critique another, collect sources, compare reasoning, and decide what to accept.

This creates several problems:

- Research is scattered across separate chats.
- Models do not automatically see each other’s arguments.
- Model disagreements are not mapped to specific claims.
- Evidence is not centralized.
- Sources are not audited by other models.
- Counter-evidence is often not actively searched.
- Idea revisions are not versioned.
- Decisions are not traceable.
- Long conversations exceed context limits.
- Important details get lost or compressed incorrectly.
- Consensus can be fake, shallow, or unsupported.

## Product objective

The product must let the user enter an idea and then run a structured research loop where selected models:

1. Extract claims, assumptions, hypotheses, and risks.
2. Independently evaluate the idea.
3. Search for supporting evidence.
4. Search for counter-evidence.
5. Audit each other’s sources and interpretations.
6. Critique each other’s reasoning.
7. Respond to critiques.
8. Revise the idea when critiques are accepted.
9. Re-evaluate each revised version.
10. Continue until full consensus, qualified consensus, no consensus, insufficient evidence, or external validation needed.
11. Produce a decision record explaining the result.

## Product principles

### 1. Evidence before acceptance

A claim cannot become accepted knowledge unless it is supported by accepted evidence or explicitly marked as a user-provided premise.

### 2. Counter-evidence is mandatory

Every important claim must be challenged by at least one adversarial search or critique task.

### 3. Models must audit each other

A model’s research is not automatically trusted. Other models must evaluate source reliability, source relevance, and interpretation quality.

### 4. Revisions reset review

A revised idea is not automatically accepted. Each new idea version must be reviewed again.

### 5. Consensus must be traceable

Final consensus must trace to claims, evidence, critiques, model votes, and context manifests.

### 6. No forced agreement

The system must allow disagreement. No consensus and insufficient evidence are valid outputs.

### 7. Memory is durable; context is temporary

The database is the long-term memory. The model context window is only a temporary working set.

### 8. Summaries are indexes, not replacements

Summaries improve retrieval but must never replace raw records.

## Key product entities

- Research Project
- Research Session
- Idea Version
- Claim
- Hypothesis
- Evidence
- Evidence Assessment
- Research Task
- Model Review
- Critique
- Critique Response
- Decision Record
- Context Manifest
- Summary
- Knowledge Edge
- Raw Event

## User journey

1. User creates a research project.
2. User enters an initial idea.
3. System creates IdeaVersion v1.
4. System extracts claims and hypotheses.
5. System creates evidence tasks.
6. Models gather or evaluate evidence.
7. Models independently review v1.
8. Models critique each other’s claims, evidence, and reasoning.
9. Models respond to critiques.
10. System creates v2 if revision is needed.
11. Loop repeats.
12. System creates final decision or records unresolved state.

## Expected final decision output

A final decision must include:

- decision status
- accepted idea version
- final idea description
- why the idea is good
- why the idea is weak or risky
- accepted evidence
- counter-evidence
- resolved critiques
- unresolved critiques
- model final votes
- remaining risks
- reopen conditions
- next actions

## Final product definition

A research workbench that uses multiple AI models not as isolated chatbots, but as structured research agents participating in a shared evidence-grounded deliberation process.
