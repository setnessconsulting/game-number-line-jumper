# Number Line Jumper session records

GAME-227 defines the browser-tab continuity boundary for the standalone game.

## Storage contract

- Key: `number-line-jumper.session.v1`
- Schema version: `1`
- Store: browser `sessionStorage` for the current tab only
- Default: enabled; set `VITE_NLJ_SESSION_RECORDS=off` to restore page-memory-only behavior for rollback
- Lifetime: until the tab/session ends, the user clears the records, or an interrupted round is discarded
- No network, account, cookie, `localStorage`, IndexedDB, telemetry, Sentry, or cross-device state

The allowlisted payload contains only:

- session best average relative error and close streak;
- the next session-local round number;
- an in-progress round's band, mode, phase, target index, generated target, completed trial facts, score total, remaining free-play seconds, marker position, seeded-generator seed/call count, and adaptive-generator state;
- a `savedAt` timestamp used only to reject stale or future resume data.

Target labels and coaching-derived numeric facts are generated game content. The payload has no player-entered free text, account or child identifiers, device fingerprint, network address, or remote correlation field.

## Resume and cleanup

Only a free-play round in `playing` or `reveal` is saved. Host break lifecycles remain owned by the host deadline and are never resumed from this store. Guided setup and Explore are not persisted.

Resume data must be schema-compatible, internally consistent, finite, in range, and no older than 24 hours within the same browser tab. Unknown versions, malformed JSON, stale/future records, impossible targets, contradictory trial counts, and invalid adaptive state are discarded rather than coerced into a playable round.

Explicit **Discard saved round** removes only the interrupted round. **Clear session records** removes the entire key and resets both session records and any saved round. Starting a new round, changing level, Explore, explicit exit, round completion, and unmount cleanup of timers do not create additional storage keys.

The current page-memory visit records remain separate: they reset on reload and are shown alongside the browser-tab session records on the summary screen.
