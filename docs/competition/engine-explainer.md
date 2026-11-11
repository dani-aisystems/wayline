# How the Wayline engine works

A whiteboard guide to the four algorithms under Wayline Клас: the adaptive placement test, spaced review, the daily planner and the XP ledger. Each section ends with the file and line to open when a judge asks. Key terms are given in English and Bulgarian.

All four share one property: **they are deterministic functions of data stored on the learner's device.** The same answers give the same level; the same history gives the same plan. Nothing is random at decision time, and nothing needs a server.

---

## 1. Adaptive placement: Rasch model + EAP

### The model (модел на Раш)

Every learner has an **ability** θ (способност, "theta"). Every test item has a **difficulty** b (трудност). Both sit on the same scale, measured in **logits** (логити). The Rasch model says the chance of a correct answer depends only on the gap between them:

```
P(correct) = 1 / (1 + e^-(θ − b))
```

- θ = b → 50%.
- θ one logit above b → 73%.
- Example: θ = 0, a B1 item with b = −0.75 → P = 0.679.

Code: [placement.ts:34](../../src/engine/placement.ts#L34).

### Where item difficulties come from

Each item is tagged with a CEFR band and an optional shift. Its difficulty is `band centre + shift × 1.2`. The band centres are 1.5 logits apart: A1 −3.75, A2 −2.25, B1 −0.75, B2 0.75, C1 2.25, C2 3.75. The band edges are A1 −4.5, A2 −3, B1 −1.5, B2 0, C1 1.5, C2 3. Below −4.5 is Pre-A1.

**Be honest about this:** these are rule-based **priors** (априорни стойности), not difficulties calibrated on real learners' answers. Calibrating them from pilot data is the obvious next step.

Code: [diagnostic.ts:64-76](../../src/content/diagnostic.ts#L64-L76).

### Estimating ability: EAP (очаквана апостериорна оценка)

1. Lay a **grid** of 241 candidate abilities from −6 to +6, step 0.05.
2. For each candidate θ, multiply:
   - a **prior** (априорно разпределение): a normal curve centred on the learner's self-rating, SD 1.6;
   - the **likelihood** (правдоподобие) of every answer so far: P(correct) for right answers, 1 − P for wrong ones.
3. The result is the **posterior** (апостериорно разпределение): how believable each θ is after the answers.
4. **EAP** = the posterior's mean. **SE** (стандартна грешка) = its standard deviation.

The code works in logarithms and subtracts the largest one before exponentiating, so a 45-item test never underflows to zero ([placement.ts:51](../../src/engine/placement.ts#L51)).

Code: [placement.ts:38-61](../../src/engine/placement.ts#L38-L61).

**Why not maximum likelihood (MLE)?** If a learner answers every item correctly, the likelihood keeps rising as θ grows, so MLE says θ = +∞. The prior keeps EAP finite. Example: 12 right answers on C2 items gives θ = 5.18, SE 0.51.

**Worked example** (computed with the same formula). Self-rating "I can hold conversations" sets the prior at −0.7.

| After | θ | SE |
| --- | --- | --- |
| Start (prior only) | −0.70 | 1.60 |
| B1 item (b −0.75), right | 0.16 | 1.34 |
| b 0.45, right | 0.90 | 1.19 |
| b −1.95, right | 1.01 | 1.14 |
| b −0.15, wrong | 0.27 | 0.97 |
| b 0.75, right | 0.74 | 0.91 |
| b 0.15, wrong | 0.31 | 0.81 |

Each answer moves θ less than the one before, and the SE falls steadily. That falling SE is what lets the test stop early.

### Choosing the next item

1. **Skill balance first:** pick the least-tested of the five skills (grammar, vocabulary, reading, listening, functional), ties broken by a fixed order.
2. **Then the most informative item:** in the Rasch model an item tells you most when P is near 50%, that is, when b is close to θ. (Its **information** (информативност) is P × (1 − P), largest at P = 0.5.) So take the unused item whose difficulty is nearest the current θ.
3. **Probe first:** for the first four items the target is shifted by 0, +1.2, −1.2, +0.6 logits, so a wrong self-rating is corrected fast.
4. **Ties** between equally close items are broken by a hash of the item id. The order is reproducible, not random.

Code: [placement.ts:89-111](../../src/engine/placement.ts#L89-L111); probes at [line 106](../../src/engine/placement.ts#L106).

### When the test stops

| Rule | Quick test | Extended test |
| --- | --- | --- |
| Never before | 12 items | 24 items |
| Always at | 30 items | 45 items |
| Precise enough: SE ≤ | 0.45 | 0.33 |
| Or clearly inside one band | the 95% interval θ ± 1.96·SE crosses no band edge | same |

The second stop rule means a learner deep inside B1 can finish sooner than one sitting on the B1/B2 edge. That is the correct behaviour: we only need enough precision to name the band.

Code: limits [placement.ts:18-21](../../src/engine/placement.ts#L18-L21); rules [placement.ts:113-124](../../src/engine/placement.ts#L113-L124).

### What the result contains

- **Band** from θ; a **range** from θ ± 1.28·SE. Note this is an **80%** interval, not 95%.
- **Per-skill estimates**, only for skills with at least 3 items. Each is re-estimated with the prior centred on the overall θ and a narrower SD of 1.0. This is **shrinkage** (свиване към общата оценка): three items alone shouldn't swing a skill wildly. ([line 158](../../src/engine/placement.ts#L158))
- **Strong / weak skills:** 0.5 logits above or below overall θ.
- **Weak topics:** items missed although their difficulty was at most θ + 0.4 (items the learner "should" know). Top 5. ([line 169](../../src/engine/placement.ts#L169))
- **Recommended start:** θ − 0.35·SE, slightly below the estimate so the first lessons build confidence. ([line 178](../../src/engine/placement.ts#L178))
- **Confidence:** high if SE ≤ 0.4, medium if ≤ 0.6, else low.

Every placement is stored as a new row; nothing is overwritten ([Placement.tsx:40](../../src/pages/placement/Placement.tsx#L40)).

**This result is exactly what the `placement_result` event will send to the teacher:** θ, SE, band and the per-skill bands. No answers, no item ids.

---

## 2. Spaced review: FSRS (интервално повторение)

### The idea

Memory fades along a **forgetting curve** (крива на забравянето). Reviewing just before you would forget makes the memory last longer each time. FSRS (Free Spaced Repetition Scheduler) models each card with:

- **Stability** (стабилност): how long the memory lasts;
- **Difficulty** (трудност на картата): how hard this card is for this learner;
- **Retrievability** (вероятност за припомняне): the probability of recalling it right now, which falls as time passes.

Wayline uses the `ts-fsrs` library (FSRS-6). We did not write the scheduler; we configure it and decide what to feed it.

### Our settings

- `request_retention: 0.9`: schedule the next review for when recall is predicted to drop to 90%.
- `enable_fuzz: true`: spread intervals slightly so cards learnt together don't all fall due on the same day.
- `maximum_interval: 3650`: never wait more than 10 years.

Code: [srs.ts:7](../../src/lib/srs.ts#L7).

### How an answer becomes a rating

| What the learner did | FSRS rating |
| --- | --- |
| Right first time | Good |
| Needed a hint | Hard |
| Had to see the answer | Again |

Code: [progress.ts:10](../../src/engine/progress.ts#L10); applied in `recordItem` at [progress.ts:40](../../src/engine/progress.ts#L40).

### Why FSRS and not SM-2

SM-2 (the classic Anki/SuperMemo algorithm) multiplies the interval by a fixed "ease" factor. It has no model of how likely you are to remember. FSRS predicts that probability directly, so we can target a retention level (90%) and sort cards by how forgotten they are.

### The review queue: no backlog walls

After a break, hundreds of cards can be overdue, which is what makes people quit. So:

1. Take every due card.
2. Sort by retrievability, **most forgotten first**. Cards never reviewed sort last.
3. Take only a cap: 20 / 35 / 50 / 80 cards for 10 / 20 / 30 / 45 daily minutes. In a normal lesson the review warm-up uses 60% of that cap.
4. The rest stay due and roll into the next sessions.

Code: [srs.ts:23-39](../../src/lib/srs.ts#L23-L39); the 60% at [progress.ts:204](../../src/engine/progress.ts#L204).

---

## 3. The daily planner (детерминиран планировчик)

### Step 1: the learner model

`learnerModel()` turns stored evidence into per-skill statistics and a list of **priorities**.

**Practice accuracy per skill** = share of "Good" or "Easy" answers, newest weighted most. Each older answer counts 0.95× the next newer one. A skill needs at least 5 answers before it gets a number. Note that a hint (rated Hard) counts as *not* correct here. ([learner.ts:52](../../src/engine/learner.ts#L52))

**Priorities**, in this order (a skill keeps only its first reason):

| Reason | Trigger | Weight |
| --- | --- | --- |
| weak-practice | practice accuracy below 65% | 3 |
| weak-placement | placement marked the skill weak | 2 |
| focus | the learner chose it as important | 2 |
| goal | linked to the learner's goal (e.g. travel → listening, speaking) | 1 |

Code: [learner.ts:78-81](../../src/engine/learner.ts#L78-L81); weights [learner.ts:104](../../src/engine/learner.ts#L104).

### Step 2: `planSession()` builds the lesson in five phases

1. **Warm-up:** due reviews from the FSRS queue.
2. **Learn:** one new explanation note from the chosen lesson region.
3. **Practice:** new items from that region, 3 / 6 / 8 / 12 by daily minutes.
4. **Reinforce:** items the learner got wrong and hasn't fixed, from the most frequent weak topic.
5. **Apply:** the region's reading text once half of it is practised, plus one listening or speaking task if those are priorities or the session is 20+ minutes.

**How the region is chosen** ([progress.ts:224-225](../../src/engine/progress.ts#L224-L225)): among unlocked, unfinished regions at or above the start level, sort by

1. lowest CEFR band first;
2. then score: +10 if already in progress, plus the priority weights of the region's skills;
3. then the library's own order.

**Important consequence:** priorities only decide *between regions of the same band*. They never jump a learner ahead of an unfinished lower band. This matters for the class focus skill (Milestone B): a teacher's focus will tilt the choice of region and the oral task, not reorder the whole course. That is defensible pedagogically, but the demo must show it through the plan's stated reason ("Priority: listening"), not expect a dramatic change.

Every part of the plan carries a **reason** the dashboard can show ([progress.ts:150-154](../../src/engine/progress.ts#L150-L154)).

**Deterministic** means: the same database contents and the same date always give the same plan. `planSession` uses no random numbers. (FSRS fuzz affects a card's due date at the moment it is reviewed, not plan building.)

Code: [progress.ts:191-293](../../src/engine/progress.ts#L191-L293).

---

## 4. The XP ledger: idempotency (идемпотентност)

### The rule

XP measures practice done, **never proficiency**. CEFR level comes only from placement and mastery.

### The mechanism

Every award has an **idempotency key** (ключ за идемпотентност): a string that names the fact being rewarded.

| Key | Meaning | Paid |
| --- | --- | --- |
| `item:<id>` | first time this exercise was completed | once ever |
| `review:<id>:<day>` | this item reviewed today | once per day |
| `session:<day>:<hash>` | this lesson finished today | once per day |
| `plan:<day>` | today's whole plan finished | once per day |
| `placement:<rowId>` | this level test completed | once per test |

`award()` runs inside a read-write transaction (транзакция): look up the key; if it exists, pay nothing; otherwise insert it. The key is the table's primary key, so even a second insert would be rejected by the database itself. A reload, a double click or a repeated request can never pay twice.

Code: [xp.ts:23-29](../../src/engine/xp.ts#L23-L29).

Levels grow gently: level n needs 50·n·(n+1) total XP: 100, 300, 600, 1,000… ([xp.ts:43](../../src/engine/xp.ts#L43)).

### Why this matters for Wayline Клас

**The sync protocol uses the same idea, one level up.** Each event gets a uuid when it is created on the device. The server inserts with `ON CONFLICT (id) DO NOTHING`. Sending the same batch twice, or ten times after a flaky connection, stores each event exactly once. If you can explain `award()`, you can explain the sync.

---

## 5. Storage: Dexie over IndexedDB

- Every table lives in the browser's IndexedDB, through the Dexie library.
- Schema versions only **add** tables or fields. Old learners' data is never changed or dropped. v1 core, v2 placements + XP + achievements, v3 exam preparation. ([db.ts:191-219](../../src/db/db.ts#L191-L219))
- Backup exports every table in `TABLES` as JSON, validated with zod on import ([db.ts:225](../../src/db/db.ts#L225)).
- Wayline Клас adds v4 with an `outbox` table. It is deliberately **not** in `TABLES`: it is transport state, not learner data.

---

## Honest limits (say these before a judge does)

1. Item difficulties are expert priors, not calibrated from response data.
2. The result range is an 80% interval; per-skill estimates have no SE shown.
3. Per-skill bands exist only for the five placement skills. Speaking and writing are tracked by practice accuracy only.
4. FSRS uses the library's default parameters, not ones fitted to our learners.

## Glossary / Речник

| English | Български |
| --- | --- |
| ability (θ) | способност |
| item difficulty (b) | трудност на задачата |
| logit | логит |
| prior / posterior | априорно / апостериорно разпределение |
| likelihood | правдоподобие |
| expected a posteriori (EAP) | очаквана апостериорна оценка |
| maximum likelihood (MLE) | метод на максималното правдоподобие |
| standard error (SE) | стандартна грешка |
| confidence interval | доверителен интервал |
| item information | информативност на задачата |
| adaptive test | адаптивен тест |
| shrinkage | свиване към общата оценка |
| spaced repetition | интервално повторение |
| forgetting curve | крива на забравянето |
| stability / retrievability | стабилност / вероятност за припомняне |
| deterministic | детерминиран |
| idempotency (key) | идемпотентност (ключ за идемпотентност) |
| transaction | транзакция |
