# FORGE Protocol Task Template

This module operates under `AGENTS.md`. All global logic (decision rules, monitoring, progression hierarchy, and system constraints) must defer to `AGENTS.md`.

This is a reusable task template for generating the next FORGE protocol from summarized prior protocol data and extracted continuity signals.

It must be used together with:

- [AGENTS.md](C:/FORGE/Internal%20Platform/FORGE%20CSS/AGENTS.md)
- [protocol_rules.md](C:/FORGE/Internal%20Platform/FORGE%20CSS/protocol_rules.md)

If the existing FORGE Intelligence layer in `C:\FORGE` is accessible, align with it directly.
If it is not accessible, treat it as the governing framework and do not reinvent it.

Use summaries wherever possible. Do not process full documents unless explicitly required.

---

## Reusable Prompt

Use summarized prior protocol and key extracted data. Do NOT process full documents unless explicitly required.

Follow:
- `AGENTS.md`
- `protocol_rules.md`
- the existing FORGE Intelligence layer in `C:\FORGE`

Do not recreate the FORGE system from scratch.
Do not generate a de novo plan unless the summarized prior protocol and extracted data clearly justify a full reset.
Generate the next protocol from the previous one rather than starting over.

---

## Athlete Inputs

- Division: [DIVISION]
- Height: [HEIGHT]
- Weight: [WEIGHT]
- Body Fat: [BODY_FAT]
- Goal Body Fat: [GOAL_BODY_FAT]
- Physique Priorities: [PHYSIQUE_PRIORITIES]
- Cardio Requirement: [CARDIO_REQUIREMENT]
- Abs/Core Requirement: [ABS_CORE_REQUIREMENT]
- Training Frequency Target: [TRAINING_FREQUENCY_TARGET]

---

## Task Flow

### Behavioral State Layer

- Read BAR score if available
- Classify:
  - LOW capacity
  - MODERATE capacity
  - HIGH capacity

- Adjust protocol complexity accordingly:
  - LOW -> simplify, reduce load, prioritize adherence
  - MODERATE -> structured progression
  - HIGH -> optimization / full progression

### Document Continuity Layer

Use summarized inputs in this order:
- most recent protocol summary
- original or baseline protocol summary
- journal / check-in / adherence summary
- coach note summary

Then:

1. Begin with a **Document Continuity Check**
2. Summarize the previous protocol before generating the next one
3. Extract:
   - prior phase
   - prior split
   - prior movement priorities
   - prior cardio
   - prior abs/core
   - progression intent
   - current recovery constraints
   - current adherence constraints
4. Explicitly determine:
   - what to continue
   - what to progress
   - what to reduce
   - what to replace
   - what to hold constant
5. Generate the next protocol from the previous protocol rather than creating a new generic plan
6. Preserve current sport-specific priorities unless the summaries justify a change

If progression data are incomplete, state exactly:

`Insufficient progression data in uploaded documents - using conservative continuation logic.`

---

## Required Output Order

### 1. Behavioral State Layer

State:
- BAR if available
- LOW / MODERATE / HIGH capacity classification
- how execution complexity is being adjusted

### 2. Document Continuity Check

State:
- which summaries were reviewed
- what the prior protocol emphasized
- what must be preserved
- what recovery/adherence constraints are active now

### 3. Previous Protocol Summary

Summarize:
- prior phase
- prior split
- movement priorities
- cardio structure
- abs/core structure
- progression intent

### 4. Continuity Decisions

Explicitly state:
- continue
- progress
- reduce
- replace
- hold constant

### 5. Next Protocol

Generate the next protocol from the previous one with:
- preserved sport-specific intent
- realistic execution
- progression continuity
- conservative adjustments when adherence or recovery are limited

### 6. Coach Intelligence

Include:
- progression validation
- gaps
- oversights
- risk flags
- next iteration strategy

---

## Token Efficiency Rules

- Use summaries, not large document dumps.
- Do not duplicate global system logic already defined in `AGENTS.md`.
- Keep this file focused on task sequencing, continuity, and reusable prompt structure.
- Defer global progression, decision, and monitoring standards to `AGENTS.md`.

---

## Sport-Specific Guardrails

For physique competitors, especially NPC bikini:

- preserve bodybuilding specificity
- reduce chaos, not specificity
- keep glute and hamstring priority
- maintain delt and upper-back emphasis for waist illusion
- avoid excessive oblique hypertrophy
- keep cardio supportive of body composition without interfering with lower-body recovery
- use abs/core to improve control, posture, and tighter waist presentation without thickening the waist
- progress from prior structure instead of resetting to a generic template

---

## Quality Standard

The finished protocol must be:
- structured
- adaptive
- progression-based
- continuous with prior programming
- realistic for execution
- safe for production use
