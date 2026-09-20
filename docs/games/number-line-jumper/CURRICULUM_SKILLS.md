# Number Line Jumper — curriculum skill registry

GAME-233 records the curriculum alignment surface for the standalone game. The
registry in `src/lib/numberLineJumper/skills.ts` is pure data and is not used to
choose targets, change difficulty, score a trial, or infer mastery.

## Registry contract

Each row has one placement band and one representation focus. Its `ccss` values
describe the closest standards alignment for the generated number-line
practice, while `ranges` and `targetKinds` state exactly what the generator can
present. The coverage test exercises direct, round, and adaptive generation and
fails if a generated target maps to zero or multiple rows, or if a row is not
reachable.

| Row | Grades | Representation | Ranges | CCSS alignment |
| --- | --- | --- | --- | --- |
| `nlj-g12-whole` | 1–2 | Whole | 0–10, 0–20, 0–100 | 1.NBT.A.1; 2.NBT.A.2 |
| `nlj-g34-fraction` | 3–4 | Fraction | 0–1, 0–2 | 3.NF.A.1; 3.NF.A.2; 3.NF.A.3; 4.NF.A.1 |
| `nlj-g34-whole` | 3–4 | Whole landmark | 0–1, 0–2 | 3.NF.A.2 |
| `nlj-g56-decimal` | 5–6 | Decimal | 0–1, 0–10 | 5.NBT.A.3; 5.NBT.A.4; 6.NS.B.3 |
| `nlj-g56-fraction` | 5–6 | Fraction | 0–1, 0–2, 0–3, 0–10 | 4.NF.A.2; 6.NS.C.6 |
| `nlj-g56-whole` | 5–6 | Whole Challenge representation | 0–10 | 6.NS.C.6 |
| `nlj-g78-fraction` | 7–8 | Signed fraction | −10–10 | 6.NS.C.6; 6.NS.C.7 |
| `nlj-g78-decimal` | 7–8 | Signed/large decimal | −10–10, 0–1000 | 6.NS.C.6; 6.NS.C.7 |
| `nlj-g78-whole` | 7–8 | Whole | −10–10, 0–1000 | 6.NS.C.6; 6.NS.C.7 |
| `nlj-g78-negative` | 7–8 | Negative | −10–10 | 6.NS.C.6; 6.NS.C.7 |

The g5–6 whole row is reachable only through the g5–8 Challenge mixed-
representation path. The g7–8 negative row is distinct from the whole row
because the engine preserves a negative `NumberKind` when a generated value is
below zero.

## Claim boundary

This registry says what the game presents, not what a learner has mastered. A
completed round, close rate, score, or placement signal must not be converted
into a CCSS mastery claim. The game remains a bounded estimation practice
surface; operations, equivalence, rounding, and computation are outside the
claims recorded here unless another story explicitly adds and verifies them.

The Pilot 0 LevelBest content inventory remains the host-owned record of what
is reachable in the current lesson release. Its Number Line Jumper entry must
reference this registry without making the game part of the no-games Pilot 0
route.
