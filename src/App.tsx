import { useEffect, useMemo, useState } from "react";

import NumberLineJumper from "./app/games/NumberLineJumper";
import type { NumberLineJumperHostV1 } from "./lib/numberLineJumper/hostContract";
import {
  GPSDK_HOST_HANDSHAKE_TIMEOUT_MS,
  type NumberLineJumperGamePlatformRuntime,
} from "./lib/numberLineJumper/gamePlatformSdk";

type ConnectionState = "connecting" | "embedded" | "standalone";

export default function App({
  gamePlatformSdk = null,
}: {
  gamePlatformSdk?: NumberLineJumperGamePlatformRuntime | null;
}) {
  const [gameKey, setGameKey] = useState(0);
  const [connectionState, setConnectionState] = useState<ConnectionState>(() => {
    if (!gamePlatformSdk) return "standalone";
    return gamePlatformSdk.isHandshakeAccepted ? "embedded" : "connecting";
  });
  const [sessionEnded, setSessionEnded] = useState(false);

  useEffect(() => {
    if (!gamePlatformSdk) return;

    const unsubscribe = gamePlatformSdk.onHandshakeAccepted(() => {
      setConnectionState((current) => (current === "connecting" ? "embedded" : current));
    });
    const timeoutId = window.setTimeout(() => {
      if (gamePlatformSdk.failConnection()) {
        setConnectionState((current) => (current === "connecting" ? "standalone" : current));
      }
    }, GPSDK_HOST_HANDSHAKE_TIMEOUT_MS);

    return () => {
      unsubscribe();
      window.clearTimeout(timeoutId);
    };
  }, [gamePlatformSdk]);

  const embedded = connectionState === "embedded";
  const host = useMemo<NumberLineJumperHostV1 | undefined>(() => {
    if (!embedded || !gamePlatformSdk) return undefined;

    const surfaceContext = gamePlatformSdk.hostLaunchConfig?.surfaceContext;
    if (!surfaceContext) return undefined;
    return {
      version: 1,
      mode: "free",
      autoStart: false,
      sessionContext: {
        surface: surfaceContext.surface,
        ...(surfaceContext.launchReason ? { launchReason: surfaceContext.launchReason } : {}),
      },
      callbacks: {
        onExit: () => gamePlatformSdk.complete("user-exit"),
      },
    };
  }, [embedded, gamePlatformSdk]);

  return (
    <main className="page-shell">
      <div className="demo-shell">
        {!embedded && (
          <header className="standalone-header">
            <p className="eyebrow">Standalone Number Line Jumper</p>
            <h1>Number Line Jumper</h1>
            <p className="lede">Estimate where numbers live. Use the midpoint, adjust your thinking, and notice how close you land.</p>
          </header>
        )}
        {connectionState === "connecting" ? (
          <p role="status">Connecting to the game platform.</p>
        ) : sessionEnded ? (
          <p role="status">This game session has ended. Use the arcade controls to leave the game, or reload to play again.</p>
        ) : (
          <section aria-label="Number Line Jumper game">
            <NumberLineJumper
              key={`${embedded ? "embedded" : "standalone"}-${gameKey}`}
              host={host}
              onExit={() => {
                if (embedded) {
                  setSessionEnded(true);
                  return;
                }
                setGameKey((value) => value + 1);
              }}
            />
          </section>
        )}
        {connectionState === "standalone" && gamePlatformSdk && (
          <p role="status">The platform connection could not be established. You can continue in standalone play.</p>
        )}
        {!embedded && (
          <footer className="standalone-footer">
            <span>Standalone baseline · session-only play</span>
            <span>No accounts, trackers, or gameplay network requests.</span>
          </footer>
        )}
      </div>
    </main>
  );
}
