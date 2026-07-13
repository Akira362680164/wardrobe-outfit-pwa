# Wardora Recommendation Rule Engine 1A — Frozen scoring assumptions

This file is the reviewable baseline for primitives that the v0.7.1-integrated specification did not define numerically. Changing one of these rules requires an explicit rule-version bump and fixture review.

## Pure-input boundary

- The engine receives `asOfDate`, target `date`, `timezone`, `weatherUpdatedAt`, `ruleVersion`, and all wardrobe/history inputs explicitly.
- Engine code does not read `Date.now()`, construct the current date, read the host timezone, or use randomness.
- Calendar day differences use UTC day serials built only from `YYYY-MM-DD` input. Candidate UUIDs use SHA-256 over `ruleVersion + userId + targetDate + sorted garment UUIDs`.
- Input arrays are sorted by stable IDs before any truncation. Same input and `ruleVersion` therefore produce byte-equivalent canonical JSON.

## Item score primitives

All component scores are finite `0..100`. Weighted totals are clamped to `0..100` and rounded to two decimals after the complete formula, not after each multiplication.

| Component | Input and normalization | Missing value |
|---|---|---|
| Weather fit | `100 - 10 * intervalDistance(itemRange, targetRange)` | 50 when no explicit or warmth-derived range exists |
| Item temperature range | Explicit min/max; otherwise warmth 1=`25..45`, 2=`18..32`, 3=`10..24`, 4=`0..15`, 5=`-30..8` | No range |
| Target temperature | Feels-like min/max, then actual min/max, then fixed thermal-strategy band | Resolver-derived band |
| Scene fit | 100 when a controlled style matches the scene family; 60 for a non-empty mismatch | 50 for no styles |
| Formality fit | `100 - 25 * abs(item - target)` | Item is hard-filtered |
| Activity comfort | Starts at 85; high heel at intensity 4–5 is -60; sneaker at intensity 4–5 is +15; warmth 4–5 in cooling is -40 | 85 |
| Rotation | Never 100; >30d 90; 14–30d 70; 7–13d 50; 3–6d 25; 0–2d 0 | Never worn |
| Item repeat penalty | 0–2d -15; 3–6d -8 | 0 |
| Historical preference | Starts 50; same-scene positive +10 each; same-scene negative -15 each; clamp | 50 |
| Negative feedback penalty | Same-scene severe -20, else moderate -10 | 0 |
| Information completeness | Seven equally weighted checks: image, category, color, season, formality, warmth, explicit temperature pair | Missing checks score 0 |

Outerwear, bag, hat, and accessory are not treated as core garments for the hard `>8°C` interval-distance exclusion. They still receive weather scores. This is the narrow interpretation of the specification's "core garment" and optional-outerwear exception.

## Candidate score primitives

- `structure=100` only after a legal T1–T8 template and required-slot check; invalid structures are not scored.
- Color harmony: at most two unique colors = 100; otherwise any controlled neutral (`black/white/gray/grey/navy/beige/brown`) = 80; otherwise 60.
- Style coherence is the largest shared-style count divided by item count; all styles missing = 50.
- Candidate rotation and completeness are arithmetic means of item values.
- Existing successful outfit bonus is `min(5, successfulWearCount)`.
- Exact combination within 3 days is -25; any >0.70 Jaccard overlap within 7 days is -10; exact same-scene moderate/severe feedback is -10/-30.
- Combination novelty: previously worn exact set 20; saved outfit 50; adapted outfit 75; new/anchor-generated 100.
- Saved/historical success: successful saved outfit 100; exact successful history older than 6 days 70; otherwise 50.
- Style variation is `70% novelty + 30% (100 - styleCoherence)`.
- Historical thermal/discomfort fit is 90 for exact positive feedback, 50 moderate negative, 20 severe negative, otherwise 70.
- Shoe/outerwear rationality is the mean activity-comfort score for those roles, or 75 when neither role contributes.
- Weather/activity fit is `60% weatherFit + 40% activityComfort`.

PAW disabled or any invalid current batch uses exactly semantic fit 50, style coherence 50, no risk/missing slots, `rule_fallback`, and `fallbackUsed=true`. PAW risk avoidance is therefore 50. Valid PAW risk levels are deterministic: none 100; severe (`too_cold`, `too_hot`, `missing_required_layer`) 0; medium (`rain_exposure`, `wind_exposure`, `formality_mismatch`, `activity_mismatch`) 40; remaining controlled risks 70.

The PAW item contract requires warmth. When a hard-filtered item is eligible from explicit temperature or season evidence but has no stored warmth, the bounded evaluator DTO uses neutral warmth `3`; this adapter-only value is not persisted back to the garment.

## Ordering and boundaries

- Garment ordering: pre-score descending, then garment UUID ascending.
- Candidate de-duplication key: sorted garment UUID set. When the same set has several sources: saved outfit, adapted outfit, anchor-generated, generated.
- Raw/rule ordering: score descending, then candidate UUID ascending.
- Shortlist union is fixed: rule Top 8, rotation Top 4, activity Top 4, novelty Top 2; fill by rule score to 12; cap at 18. Novelty ties prefer anchor-generated, then candidate UUID.
- Objective tie-break: objective score; safe then prefers `rain_ready`; fresh then higher long-unworn value; comfort then higher activity comfort; candidate UUID last.
- Diversity accepts Jaccard exactly 0.50 in the first pass and exactly 0.67 (implemented as the exact ratio `2/3`) in the relaxed pass. It never restores a filtered item or candidate.
- Hard temperature exclusion is strictly `distance > 8`; exactly 8 remains eligible. Formality exclusion is `abs(diff) >= 3`.

## Known product assumptions still requiring review

- Scene keyword families are deliberately small and generic; they are not a destination-specific dictionary.
- A full-rain or warm context makes outerwear required. A one-piece satisfies the top-and-bottom body structure; a skirt can satisfy the lower-body role represented by the resolver's `pants` baseline.
- `material` remains a cleaned free string. Avoid rules use exact generic substrings only (`suede`, leather/PVC family); no new material taxonomy is introduced.
- No real PAW, real weather provider, persistence, worker, queue, migration, or production API route is present in 1A.
