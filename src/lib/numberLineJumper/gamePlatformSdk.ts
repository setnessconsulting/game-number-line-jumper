import type {
  CompletionReason,
  GameIdentity,
  HostLaunchConfig,
  SessionCompletionPayload,
} from "@setnessconsulting/game-platform-sdk/core";
import {
  IframeTransport,
  type IframeTransportOptions,
  type HostTransport,
} from "@setnessconsulting/game-platform-sdk/host";
import adoption from "./gamePlatformSdkAdoption.json";

export const NUMBER_LINE_JUMPER_GAME_IDENTITY: GameIdentity = {
  gameId: adoption.gameId,
  gameVersion: adoption.gameVersion,
  sdkVersion: adoption.sdkVersion,
  protocolVersion: adoption.protocolVersion as GameIdentity["protocolVersion"],
  runtimeKind: adoption.runtimeKind as GameIdentity["runtimeKind"],
  capabilities: adoption.capabilities,
};

export const GPSDK_HOST_HANDSHAKE_TIMEOUT_MS = 10_000;

type AcceptedHostLaunchConfig = HostLaunchConfig & {
  surfaceContext: NonNullable<HostLaunchConfig["surfaceContext"]> & {
    surface: "arcade";
  };
};

export type IframeTransportFactory = (options: IframeTransportOptions) => HostTransport;

const createIframeTransport: IframeTransportFactory = (options) =>
  new IframeTransport(options);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isArcadeHostConfig(value: unknown): value is AcceptedHostLaunchConfig {
  if (
    !isRecord(value) ||
    value.protocolVersion !== "1.0" ||
    value.sessionMode !== "embedded"
  ) {
    return false;
  }

  const context = value.surfaceContext;
  if (!isRecord(context) || context.surface !== "arcade") return false;
  const launchReason = context.launchReason;
  return (
    launchReason === undefined ||
    launchReason === "standalone" ||
    launchReason === "placement" ||
    launchReason === "earned-break" ||
    launchReason === "direct"
  );
}

export function readGpsdkSessionParams(
  search: string = typeof window !== "undefined" ? window.location.search : "",
): { channelId: string; sessionId: string } | null {
  const params = new URLSearchParams(search);
  const channelId = params.get("gpsdkChannel");
  const sessionId = params.get("gpsdkSession");
  if (!channelId || !sessionId) return null;
  return { channelId, sessionId };
}

/**
 * Connects Number Line Jumper to a same-origin arcade parent when the parent
 * supplies a GPSDK session. Direct visits without session parameters remain
 * standalone and create no postMessage listener.
 */
export class NumberLineJumperGamePlatformRuntime {
  private transport: HostTransport | null = null;
  private unsubscribe: (() => void) | null = null;
  private startedAtMs = 0;
  private completed = false;
  private handshakeAccepted = false;
  private acceptedHostConfig: AcceptedHostLaunchConfig | null = null;
  private readonly readyListeners = new Set<() => void>();
  private connectionFailed = false;

  constructor(
    private readonly transportFactory: IframeTransportFactory = createIframeTransport,
  ) {}

  get isHandshakeAccepted(): boolean {
    return this.handshakeAccepted;
  }

  get hostLaunchConfig(): AcceptedHostLaunchConfig | null {
    return this.acceptedHostConfig;
  }

  connect(search?: string): boolean {
    if (this.connectionFailed) return false;
    if (this.transport) return true;

    const ids = readGpsdkSessionParams(search);
    if (!ids || typeof window === "undefined" || window.parent === window)
      return false;

    const origin = window.location.origin;
    if (!origin || origin === "null") return false;

    try {
      const transport = this.transportFactory({
        channelId: ids.channelId,
        sessionId: ids.sessionId,
        targetWindow: window.parent,
        targetOrigin: origin,
        allowedOrigins: [origin],
      });
      this.transport = transport;
      this.startedAtMs = performance.now();
      this.unsubscribe = transport.onMessage((envelope) => {
        if (envelope.messageType === "HANDSHAKE_ACK") {
          if (this.handshakeAccepted) return;
          const payload = envelope.payload;
          if (!isRecord(payload) || !isArcadeHostConfig(payload.hostConfig))
            return;
          this.acceptedHostConfig = payload.hostConfig;
          this.handshakeAccepted = true;
          for (const listener of this.readyListeners) {
            try {
              listener();
            } catch {
              // A UI listener must not disrupt the protocol transport.
            }
          }
        }
      });
      transport.sendMessage("HANDSHAKE_INIT", {
        gameIdentity: NUMBER_LINE_JUMPER_GAME_IDENTITY,
      });
      return true;
    } catch {
      this.destroy();
      return false;
    }
  }

  onHandshakeAccepted(listener: () => void): () => void {
    this.readyListeners.add(listener);
    if (this.handshakeAccepted) {
      try {
        listener();
      } catch {
        // A UI listener must not disrupt the protocol transport.
      }
    }
    return () => this.readyListeners.delete(listener);
  }

  complete(reason: CompletionReason = "user-exit"): void {
    if (!this.transport || !this.handshakeAccepted || this.completed) return;
    this.completed = true;

    const payload: SessionCompletionPayload = {
      sessionId: this.transport.sessionId,
      gameId: NUMBER_LINE_JUMPER_GAME_IDENTITY.gameId,
      gameVersion: NUMBER_LINE_JUMPER_GAME_IDENTITY.gameVersion,
      durationMs: Math.max(0, Math.round(performance.now() - this.startedAtMs)),
      reason,
    };
    this.transport.sendMessage("COMPLETE_SESSION", payload);
  }

  /** Report a failed handshake before falling back to standalone play. */
  failConnection(): boolean {
    if (!this.transport || this.handshakeAccepted || this.connectionFailed) return false;
    this.connectionFailed = true;
    try {
      this.transport.sendMessage("ERROR_SIGNAL", {
        code: "TRANSPORT_FAILURE",
        severity: "recoverable",
        source: "game",
        message: "The game platform handshake timed out; continuing in standalone play.",
      });
    } catch {
      // Standalone fallback must still happen if the host window has disappeared.
    } finally {
      this.destroy();
    }
    return true;
  }

  destroy(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.transport?.destroy();
    this.transport = null;
    this.readyListeners.clear();
  }
}
