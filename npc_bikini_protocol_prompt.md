# FORGË Movement Engine — NPC Bikini Module

This module operates under `AGENTS.md`. All global logic such as progression hierarchy, decision rules, monitoring, and behavioral-capacity handling defer to `AGENTS.md`. This file contains movement-specific logic only.

## SCOPE

This task module is specifically for the movement side of a FORGË protocol for an NPC bikini competitor.

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
Continue progression from the prior protocol rather than resetting to a generic template.

This task is specifically for the **movement side** of a FORGE protocol for an NPC bikini competitor.

Athlete Inputs:
- Division: [DIVISION]
- Height: [HEIGHT]
- Weight: [WEIGHT]
- Body Fat: [BODY_FAT]
- Goal Body Fat: [GOAL_BODY_FAT]
- Current Phase: [CURRENT_PHASE]
- Physique Priorities: [PHYSIQUE_PRIORITIES]
- Cardio Requirement: [CARDIO_REQUIREMENT]
- Abs/Core Requirement: [ABS_CORE_REQUIREMENT]
- Training Frequency Target: [TRAINING_FREQUENCY_TARGET]

## ATHLETE PRIORITIES

Preserve unless prior protocol or recovery data justify change:
- glute development priority
- hamstring development priority
- shoulder cap / delt roundness emphasis
- upper-back shaping for waist illusion
- tight, lean waist strategy
- realistic starting weight ranges
- 20-minute cardio structure when required
- abs/core that improve presentation and trunk control without thickening the waist

Before generating anything:

### Behavioral State Layer

- Read BAR score if available
- Classify:
  - LOW capacity
  - MODERATE capacity
  - HIGH capacity

- Adjust training accordingly:
  - LOW -> reduce volume and complexity
  - MODERATE -> structured progression
  - HIGH -> full progression

## DOCUMENT CONTINUITY

Use summarized prior protocol and key extracted data in this order:
- most recent protocol summary
- original or baseline protocol summary
- journal / check-in / adherence summary
- coach note summary

Then:

1. Begin with a **Document Continuity Check**
2. Summarize the prior protocol before generating the next one
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
5. Generate the next movement protocol from the previous one instead of creating a generic new template

If progression data are incomplete, state exactly:

`Insufficient progression data in uploaded documents — using conservative continuation logic.`

---

## Required Output Structure

### 1. Behavioral State Layer

State:
- BAR if available
- LOW / MODERATE / HIGH capacity classification
- how training volume and complexity are being adjusted

### 2. Document Continuity Check

State:
- which summaries were reviewed
- what the prior protocol emphasized
- what must be preserved
- what recovery/adherence constraints are active now

### 3. Prior Protocol Summary

Summarize:
- prior phase
- prior weekly split
- prior glute / hamstring / delt / upper-back priorities
- prior cardio structure
- prior abs/core structure
- prior progression intent

### 4. Continuity Decisions

Explicitly state:
- continue
- progress
- reduce
- replace
- hold constant

### 5. Movement Protocol Overview

Provide:
- the purpose of this next phase
- how it continues from the prior protocol
- why the changes are appropriate for current recovery and adherence capacity

### 6. Weekly Split

Provide a clear weekly split aligned to the target training frequency.

### 7. Full Day-by-Day Program

For each training day, include exercise tables with:
- exercise name
- sets
- reps
- realistic starting weight ranges
- rest periods
- coaching notes

The day-by-day program must preserve NPC bikini movement priorities:
- glutes
- hamstrings
- capped delts
- upper-back shaping
- waist illusion

### 8. Cardio Section

Include:
- cardio duration
- frequency
- intensity guidance
- how cardio supports body composition without interfering with lower-body recovery

### 9. Abs/Core Section

Include:
- exact abs/core prescription
- presentation and trunk-control purpose
- waist-preservation logic

Avoid excessive oblique hypertrophy and avoid anything likely to thicken the waist.

### 10. Movement-Specific Progression Notes

Include only movement-specific details such as:
- how load progresses
- how reps progress
- when complexity should stay constrained for recovery or adherence reasons

Global progression hierarchy, decision rules, and monitoring must defer to `AGENTS.md`.

### 11. Waist-Preservation Notes

Include specific notes on:
- exercise selection
- trunk stability
- avoiding unnecessary waist thickening

### 12. Recovery Modifications

Include modifications for:
- poor recovery
- low adherence weeks
- fatigue spikes
- lower-body soreness that could interfere with quality execution

### 13. Coach Intelligence

Include:
- progression validation
- gaps
- oversights
- risk flags
- next iteration strategy

---

## Token Efficiency Rules

- Use summaries, not large document dumps.
- Do not restate global FORGE system rules already defined in `AGENTS.md`.
- Keep only bikini-specific movement intelligence and continuity instructions in this module.
- Preserve movement structure and sport specificity without redundant system explanation.

---

## Quality Standard

The finished protocol must be:
- structured
- adaptive
- progression-based
- bodybuilding-specific
- practical to execute
- continuous with prior programming
- safe for production use
