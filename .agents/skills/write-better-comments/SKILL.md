---
name: write-better-comments
description: Use when writing or editing code comments, docstrings, or JSDoc, and when asked to clean up, prune, condense, audit, or de-AI the comments in a file, diff, PR, or repo. Triggers include "too many comments", "verbose comments", "comment pass", "remove the AI comments", "document this file", "add comments here", stale or misleading comments, and doc comments that only restate the signature.
---

# Write Better Comments

## Overview

One test decides every comment:

> **Does it state something a competent reader cannot get from the code in front of them?**

No, it doesn't → the comment must not exist. Yes, it does → it must be the shortest form of that fact, placed where the reader hits it.

Two failure modes, and both are real:

- **Restatement.** Narration, echoed names and signatures, change notes. It rots out of sync, adds diff noise, and trains readers to skim past comments entirely. This is the bulk of agent-written comment volume.
- **Silence.** Units, ranges, failure modes, cross-file coupling, the reason a tempting simplification is wrong. The code genuinely cannot show these, and their absence is what makes the next change break something.

"Fewer comments" is not the goal. **Load-bearing** comments are. Delete the restatement, write the silence.

## Routing

| Situation                                                | Go to                                                           |
| -------------------------------------------------------- | --------------------------------------------------------------- |
| Writing or changing code now                             | Slots + Writing contract, below                                 |
| Asked to clean, prune, audit, or de-AI existing comments | Read **sweep.md** and follow it                                 |
| Asked to "document this file"                            | Both: sweep first, then write what the sweep flagged as missing |

## The slots

A comment earns its place only as one of these seven. No slot, no comment.

| Slot               | The fact it carries                                                                                                                                                                                                              | Example                                                                                 |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| **Contract**       | What a caller must know and the signature can't say: units, valid ranges, nullability the type lies about, side effects, idempotency, throw/failure behavior, what has already been done to the inputs                           | `// pence, not pounds`                                                                  |
| **Constraint**     | A non-obvious invariant binding two values, especially across files                                                                                                                                                              | `// total backoff must stay under LOCK_TTL_MS or a second worker picks up the same row` |
| **Coupling**       | "Keep in sync with X." The pointer _is_ the why: it is the only thing stopping two copies from drifting                                                                                                                          | `// mirrors the tier boundaries in the ledger report`                                   |
| **Hazard**         | The surprising but essential line, and why the obvious simplification is wrong                                                                                                                                                   | `// empty body means duplicate, not failure - retrying double-collects`                 |
| **Data semantics** | Meaning, order, or units of a literal, which the literal cannot show                                                                                                                                                             | `[0, 10_000], // pence`                                                                 |
| **Provenance**     | Ticket, RFC, standard, or source of a copied algorithm, as a trailing breadcrumb - never as the explanation itself                                                                                                               | `// (WAGE-1234)`                                                                        |
| **Orientation**    | One line on a public function, endpoint, or module that other teams consume without reading the body: what the caller gets, never the steps the body takes. Plus structural section banners, which are navigation, not narration | `// --- helpers ---`                                                                    |

## Writing contract

Every comment you write satisfies all five:

1. **Name its slot.** If you cannot, delete the comment instead of softening it.
2. **State the one fact.** Not the mechanism the code already shows, not where the value is consumed downstream, not the consequence of the consequence, not the justification of the justification.
3. **Two lines or fewer.** Irreducibly multi-part rationale (a workaround, plus the bug it works around, plus the removal condition) may run longer; length has to be earned by facts, never inherited from a template.
4. **Put it on the line it governs.** A fact about a field goes on the field. A module header holds only what is true of the whole module. Proximity is what keeps comments true: a comment beside its line gets updated when the line changes; a header block three screens up does not.
5. **Write for someone who never saw your diff or your task brief.** No "updated to", "as requested", "per the brief", "fixed the off-by-one". Change context belongs in the commit message.

**"Carries a real why" and "is worded minimally" are independent judgments.** Passing the first does not exempt a comment from the second. A comment can hold genuine rationale and still be three times too long.

Prefer making the code say it. A rename that makes a comment unnecessary beats the comment.

## Core pattern

A doc comment an agent wrote for a brief whose one non-obvious fact was _"total backoff must stay under the lock TTL or a second worker can pick up the same payout"_:

```ts
/**
 * Schedule the earliest collection date that is at least 3 clear working days
 * after `now`, and persist it.
 *
 * Uses clear working days (weekends and bank holidays excluded) rather than
 * +3 calendar days; the calendar-day version caused WAGE-1234.
 */
export async function scheduleCollection(payout: Payout, now: Date): Promise<Date> {
```

The first sentence restates the name and the body. The real fact is the deviation, and it belongs where a maintainer would otherwise "simplify" it:

```ts
export async function scheduleCollection(payout: Payout, now: Date): Promise<Date> {
  // Clear working days, not +3 calendar days - weekends and bank holidays
  // do not count (WAGE-1234).
  const date = clearWorkingDaysAfter(now, 3);
```

Same for constants. `/** Clear working days required between now and the collection date. */` over `const CLEAR_WORKING_DAYS = 3` is the name spelled twice; it has no slot, so it does not get written.

## Red flags

Stop if you are about to:

- Write a doc comment whose first sentence is the function name in prose, or a one-liner that lists what the body does (`// takes the lock, persists the date, returns it`)
- Write `@param`/`@returns` that repeat the parameter name and its type
- Explain a step (`// loop over the accounts`, `// check if empty`) or mark a block end (`} // end if`)
- Describe what you just changed, or point at a task brief, spec section, or requirements doc
- Keep a five-line block because "it's a real why" without razoring the wording
- Put a fact in a file header when it is a fact about one field or one line
- Describe the mechanism of code you find inscrutable instead of flagging the code

## Rationalizations

| Excuse                                                     | Reality                                                                                                          |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| "It carries a real why, so the wording stays"              | Two independent judgments. Razor every comment you keep.                                                         |
| "A summary of the function is helpful"                     | One line on a public surface stating what the caller gets, yes. A paraphrase of the body, at any length, no.     |
| "The spec reference gives useful context"                  | Section numbers are superseded and rot. Encode the substance; keep only durable breadcrumbs (see sweep.md).      |
| "The header block already states it"                       | A reader at line 90 does not see line 6, and the header does not get updated when line 90 changes.               |
| "The banner is decoration"                                 | Banners are navigation. They restate no line of code. Keep them.                                                 |
| "Types make the contract obvious"                          | `string` does not say ISO-8601; `number` does not say pence; a non-null type does not stop legacy null rows.     |
| "The code is unclear, so it needs a comment describing it" | That is a code smell, not a comment gap. Flag the code; never invent a mechanism description you did not verify. |
| "More documentation is safer"                              | Restatement is not neutral. It rots, and it teaches readers to skip the comment that mattered.                   |
