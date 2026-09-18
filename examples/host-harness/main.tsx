import { StrictMode, useCallback, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import NumberLineJumper from "../../src/app/games/NumberLineJumper";
import type { NumberLineJumperHostV1 } from "../../src/lib/numberLineJumper/hostContract";
import "../../src/app/globals.css";

function LocalHostHarness() {
  const [mounted, setMounted] = useState(true);
  const [returned, setReturned] = useState(false);
  const [events, setEvents] = useState<string[]>([]);
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const rawRemainingMs = Number(params.get("remainingMs") ?? "15000");
  const remainingMs = Number.isFinite(rawRemainingMs) && rawRemainingMs >= 0 ? rawRemainingMs : 15_000;
  const invalidPlacement = params.get("placement") === "invalid";
  const placementLevel = params.has("level") ? Number(params.get("level")) : null;
  const appendEvent = useCallback((event: string) => {
    setEvents((current) => [...current, event]);
  }, []);

  const host = useMemo<NumberLineJumperHostV1>(() => ({
    version: 1,
    mode: "break",
    autoStart: true,
    ...(invalidPlacement || placementLevel !== null ? {} : { initialBand: "g12" as const }),
    ...(invalidPlacement
      ? { placementResult: { status: "complete" as const, level: 99 } }
      : placementLevel !== null
        ? { placementResult: { status: "complete" as const, level: placementLevel } }
        : {}),
    timeLimit: { kind: "remaining", remainingMs },
    sessionContext: { surface: "practice", launchReason: "earned-break" },
    callbacks: {
      onExit: (event) => appendEvent(`exit:${event.reason}`),
      onReturnToPractice: (event) => {
        appendEvent(`return:${event.reason}`);
        setReturned(true);
        setMounted(false);
      },
      onRoundComplete: (event) => appendEvent(`round:${event.roundNumber}:${event.band}`),
      onSessionAggregate: (event) => appendEvent(`aggregate:${event.reason}:${event.aggregate.trials}`),
      onError: (event) => appendEvent(`error:${event.severity}:${event.code}`),
    },
  }), [appendEvent, invalidPlacement, placementLevel, remainingMs]);

  return (
    <main className="page-shell">
      <div className="demo-shell">
        <header className="standalone-header">
          <p className="eyebrow">Local host harness · GAME-292</p>
          <h1>Number Line Jumper host boundary</h1>
          <p className="lede">This local-only parent demonstrates auto-start, a bounded break, typed callbacks, and host-owned return behavior.</p>
        </header>
        <p data-testid="host-status" role="status">
          {returned ? "Host returned to practice" : mounted ? "Host session active" : "Game unmounted by host"}
        </p>
        <section aria-label="Embedded Number Line Jumper">
          {mounted ? <NumberLineJumper host={host} onExit={() => setMounted(false)} /> : null}
        </section>
        <section aria-label="Host event log">
          <h2>Events received by the host</h2>
          <ol data-testid="host-events">{events.map((event, index) => <li key={`${index}-${event}`}>{event}</li>)}</ol>
        </section>
      </div>
    </main>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("Local host harness root element was not found.");
createRoot(root).render(<StrictMode><LocalHostHarness /></StrictMode>);
