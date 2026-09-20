# Number Line Jumper — Bounded Learner Interaction Protocol

This document is the bounded protocol record for GAME-223. It is retained for
traceability, but the associated owner-run child-interaction claim is
withdrawn. No learner sessions were run for this story and no participant
result is claimed.

## Status

| Field | Record |
| --- | --- |
| Claim status | **Withdrawn** |
| Protocol status | Defined, **not run** |
| Owner result | No owner-observed child-interaction evidence supplied |
| Data disposition | No participant data, recordings, identifiers, or gameplay telemetry collected |
| Jira disposition | Transition GAME-223 to **Won't Do** with this document as the bounded audit record |

The absence of a run is intentional. Automated browser and accessibility
coverage remains valid for the claims it tests, but it does not become child
research evidence and does not replace GAME-224 owner screen-reader or release
acceptance gates.

## Intended hypotheses (not results)

If a future owner-approved study is opened as a separate story, it may test:

1. Learners can connect the target representation to a location on the line
   without losing the numeric truth during feedback.
2. A wrong placement and the reveal motion provide a usable next step rather
   than only a correctness signal.
3. The setup, input, Continue, Exit, and summary controls are understandable
   within one short session on desktop and touch input.
4. Learners can recover from a mistake or pause without the game becoming
   stuck or requiring hidden host state.

These are hypotheses only. This repository contains no participant outcome,
completion percentage, preference result, or learning-effect claim.

## Intended bounded runbook (not executed)

The following constraints define the smallest safe future run if an owner
opens a new, separately authorized story:

- Use one named immutable game release and record its exact source SHA and
  games-site version before the session starts.
- Obtain guardian/participant consent through the owner's approved process;
  do not collect names, contact details, school identifiers, recordings,
  screenshots containing a learner, or free-form child data in this repository.
- Limit each session to 15 minutes, with a voluntary stop at any time.
- Use only the game UI. Do not enable accounts, network instrumentation,
  telemetry, browser extensions, or persistent gameplay storage.
- Observe at most the four hypotheses above and record aggregate pass/fail or
  count data only. Do not retain raw interaction traces.
- Stop immediately for distress, privacy exposure, an accessibility blocker,
  an unsafe interaction, or a defect that could invalidate the session.
- Record device class, browser, exact game release, and an owner-signed
  aggregate outcome only if the owner explicitly authorizes the future story.

## Intended decision thresholds (not evaluated)

The withdrawn story did not authorize a sample or result. For a future story,
the owner would need to approve the sample and thresholds before collecting
data. The following placeholders show the decision shape without pretending
that it was approved or measured:

- a named sample size and inclusion rule;
- a completion threshold for the core Guided flow;
- a threshold for recovering from an incorrect placement;
- a threshold for successful keyboard/touch operation;
- zero unresolved privacy, safety, or release-blocking accessibility findings.

No threshold is marked passed in this repository.

## Closure statement

GAME-223 is not a hidden release gate after the claim is withdrawn. Its
protocol is retained so a future owner decision can start from an explicit,
privacy-minimal boundary. GAME-224 must list GAME-223 as `withdrawn` / `not
run`, not as a passed learner-study result.
