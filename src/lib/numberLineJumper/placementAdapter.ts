import type { PlacementBand } from "./types";

/** The minimal privacy-safe placement signal accepted from a host. */
export interface PlacementResultSignalV1 {
  status: "complete" | "incomplete";
  /** Grade level from 1 through 8; no learner identity or raw answers. */
  level: number;
}

export function isPlacementBand(value: unknown): value is PlacementBand {
  return value === "g12" || value === "g34" || value === "g56" || value === "g78";
}

/**
 * Pure host adapter. Placement is advisory input only; the mathematical
 * engine remains authoritative for targets, scoring, and round outcomes.
 */
export function mapPlacementResultToBand(value: unknown): PlacementBand | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const signal = value as Record<string, unknown>;
  if (signal.status !== "complete" || typeof signal.level !== "number") return null;
  if (!Number.isInteger(signal.level) || signal.level < 1 || signal.level > 8) return null;

  if (signal.level <= 2) return "g12";
  if (signal.level <= 4) return "g34";
  if (signal.level <= 6) return "g56";
  return "g78";
}
