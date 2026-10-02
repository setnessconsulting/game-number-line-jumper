import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProtocolEnvelope } from "@setnessconsulting/game-platform-sdk/core";
import type { HostTransport } from "@setnessconsulting/game-platform-sdk/host";
import {
  GPSDK_HOST_HANDSHAKE_TIMEOUT_MS,
  NUMBER_LINE_JUMPER_GAME_IDENTITY,
  NumberLineJumperGamePlatformRuntime,
  type IframeTransportFactory,
} from "@/lib/numberLineJumper/gamePlatformSdk";
import gamePackage from "../package.json";
import sdkPackage from "../node_modules/@setnessconsulting/game-platform-sdk/package.json";

class FakeTransport implements HostTransport {
  readonly sent: Array<{ messageType: string; payload: unknown }> = [];
  readonly handlers = new Set<(envelope: ProtocolEnvelope) => void>();
  destroyed = false;

  constructor(
    readonly channelId: string,
    readonly sessionId: string,
  ) {}

  sendMessage(messageType: string, payload: unknown): void {
    this.sent.push({ messageType, payload });
  }

  onMessage(handler: (envelope: ProtocolEnvelope) => void): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  destroy(): void {
    this.destroyed = true;
    this.handlers.clear();
  }

  receive(messageType: string, payload: unknown): void {
    const envelope = {
      protocolVersion: "1.0",
      channelId: this.channelId,
      sessionId: this.sessionId,
      messageId: `message-${this.sent.length}`,
      sequenceNumber: this.sent.length,
      timestampEpochMs: Date.now(),
      messageType,
      payload,
    } as ProtocolEnvelope;
    for (const handler of this.handlers) handler(envelope);
  }
}

function installEmbeddedWindow(): void {
  vi.stubGlobal("window", {
    location: { origin: "https://games.example", search: "" },
    parent: {},
  });
}

function arcadeAck() {
  return {
    hostConfig: {
      protocolVersion: "1.0",
      sessionMode: "embedded",
      surfaceContext: { surface: "arcade", launchReason: "direct" },
    },
    activeExtensions: [],
  };
}

describe("Number Line Jumper Game Platform SDK runtime", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("stays standalone when session query values are absent", () => {
    installEmbeddedWindow();
    const factory = vi.fn<IframeTransportFactory>();
    const runtime = new NumberLineJumperGamePlatformRuntime(factory);

    expect(runtime.connect("?other=1")).toBe(false);
    expect(factory).not.toHaveBeenCalled();
  });

  it("sends its package-derived identity and accepts only an embedded arcade ACK", () => {
    installEmbeddedWindow();
    const transport = new FakeTransport("channel-1", "session-1");
    const factory: IframeTransportFactory = () => transport;
    const runtime = new NumberLineJumperGamePlatformRuntime(factory);
    const onReady = vi.fn();
    runtime.onHandshakeAccepted(onReady);

    expect(runtime.connect("?gpsdkChannel=channel-1&gpsdkSession=session-1")).toBe(true);
    expect(transport.sent[0]).toEqual({
      messageType: "HANDSHAKE_INIT",
      payload: { gameIdentity: NUMBER_LINE_JUMPER_GAME_IDENTITY },
    });
    expect(NUMBER_LINE_JUMPER_GAME_IDENTITY.gameVersion).toBe(gamePackage.version);
    expect(NUMBER_LINE_JUMPER_GAME_IDENTITY.sdkVersion).toBe(sdkPackage.version);

    transport.receive("HANDSHAKE_ACK", {
      ...arcadeAck(),
      hostConfig: {
        ...arcadeAck().hostConfig,
        surfaceContext: { surface: "practice" },
      },
    });
    expect(runtime.isHandshakeAccepted).toBe(false);

    transport.receive("HANDSHAKE_ACK", arcadeAck());
    expect(runtime.isHandshakeAccepted).toBe(true);
    expect(runtime.hostLaunchConfig?.surfaceContext?.surface).toBe("arcade");
    expect(onReady).toHaveBeenCalledTimes(1);
    expect(GPSDK_HOST_HANDSHAKE_TIMEOUT_MS).toBe(10_000);
  });

  it("reports completion once after acceptance", () => {
    installEmbeddedWindow();
    const transport = new FakeTransport("channel-1", "session-1");
    const runtime = new NumberLineJumperGamePlatformRuntime(() => transport);
    runtime.connect("?gpsdkChannel=channel-1&gpsdkSession=session-1");
    transport.receive("HANDSHAKE_ACK", arcadeAck());

    runtime.complete("user-exit");
    runtime.complete("user-exit");

    expect(transport.sent.filter((message) => message.messageType === "COMPLETE_SESSION")).toHaveLength(1);
    expect(transport.sent.at(-1)?.payload).toMatchObject({
      sessionId: "session-1",
      gameId: NUMBER_LINE_JUMPER_GAME_IDENTITY.gameId,
      gameVersion: NUMBER_LINE_JUMPER_GAME_IDENTITY.gameVersion,
      reason: "user-exit",
    });
  });

  it("reports a handshake timeout before destroying the transport and rejects a late ACK", () => {
    installEmbeddedWindow();
    const transport = new FakeTransport("channel-1", "session-1");
    const runtime = new NumberLineJumperGamePlatformRuntime(() => transport);
    const onReady = vi.fn();
    runtime.connect("?gpsdkChannel=channel-1&gpsdkSession=session-1");
    runtime.onHandshakeAccepted(onReady);

    expect(runtime.failConnection()).toBe(true);
    expect(transport.sent.at(-1)).toEqual({
      messageType: "ERROR_SIGNAL",
      payload: expect.objectContaining({
        code: "TRANSPORT_FAILURE",
        source: "game",
      }),
    });
    expect(transport.destroyed).toBe(true);
    expect(runtime.connect("?gpsdkChannel=channel-1&gpsdkSession=session-1")).toBe(false);
    transport.receive("HANDSHAKE_ACK", arcadeAck());
    expect(runtime.isHandshakeAccepted).toBe(false);
    expect(onReady).not.toHaveBeenCalled();
  });
});
