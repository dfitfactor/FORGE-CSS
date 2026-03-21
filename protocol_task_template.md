# FORGE Protocol Task Template

This file is a reusable task wrapper under [AGENTS.md](C:/FORGE/Internal%20Platform/FORGE%20CSS/AGENTS.md).

It does not restate the FORGE system.
It organizes the work so generation stays summary-first, continuous, and token-efficient.

Use together with:

- [AGENTS.md](C:/FORGE/Internal%20Platform/FORGE%20CSS/AGENTS.md)
- [protocol_rules.md](C:/FORGE/Internal%20Platform/FORGE%20CSS/protocol_rules.md)

If the FORGE Intelligence layer in `C:\FORGE` is accessible, align with it directly.
If it is not accessible, treat it as governing context and do not reinvent it.

## Reusable Prompt

Use summarized prior protocol and key extracted data. Do NOT process full documents unless explicitly required.

Follow:
- `AGENTS.md`
- `protocol_rules.md`
- the existing FORGE Intelligence layer in `C:\FORGE`

Do not create a de novo plan unless the summarized prior protocol and extracted data clearly justify a full reset.
Generate the next protocol from the previous one rather than starting over.

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

## Task Flow

Use summarized inputs in this order:

1. most recent protocol summary
2. original or baseline protocol summary
3. journal/check-in/adherence summary
4. coach note summary

Then:

1. Begin with a **Document Continuity Check**
2. Summarize the previous protocol before generating the next one
3. Extract the continuity items required by `protocol_rules.md`
4. Explicitly determine:
   - continue
   - progress
   - reduce
   - replace
   - hold constant
5. Generate the next protocol from the previous protocol rather than creating a new generic plan

If progression data are incomplete, state exactly:

`Insufficient progression data in uploaded documents - using conservative continuation logic.`

## Required Output Order

1. Document Continuity Check
2. Previous Protocol Summary
3. Continuity Decisions
4. Next Protocol
5. Coach Intelligence

## Token Efficiency Rules

- Use summaries, not large document dumps
- Do not duplicate global system logic already defined in `AGENTS.md`
- Keep this file focused on task sequencing and output order

