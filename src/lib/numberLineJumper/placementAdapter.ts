import type { PlacementBand } from "./types";

/**
 * The original GAME-292 shorthand signal. It remains accepted so existing
 * local hosts do not need to change when the canonical host result is added.
 */
export interface PlacementResultSignalV1 {
  status: "complete" | "incomplete";
  /** Grade level from 1 through 8; no learner identity or raw answers. */
  level: number;
}

/**
 * The privacy-safe grade-third-v1 shape emitted by the assessment boundary.
 * This mirrors the contract shape without importing the host application.
 */
export interface GradeThirdPlacementSignalV1 {
  kind: "band" | "below" | "above";
  band: { grade: number; third: "early" | "mid" | "late" } | null;
  levelParam: string | null;
}

export type PlacementResultInputV1 = PlacementResultSignalV1 | GradeThirdPlacementSignalV1;

export function isPlacementBand(value: unknown): value is PlacementBand {
  return value === "g12" || value === "g34" || value === "g56" || value === "g78";
}

function bandForGrade(grade: number): PlacementBand | null {
  if (!Number.isInteger(grade) || grade < 1 || grade > 8) return null;
  const high = Math.ceil(grade / 2) * 2;
  return `g${high - 1}${high}` as PlacementBand;
}

function mapGradeThirdSignal(value: Record<string, unknown>): PlacementBand | null {
  const band = value.band as Record<string, unknown> | null | undefined;
  const grade = band?.grade;
  const third = band?.third;
  return value.kind === "band" &&
    typeof value.levelParam === "string" &&
    typeof grade === "number" &&
    Number.isInteger(grade) &&
    grade >= 1 &&
    grade <= 8 &&
    (third === "early" || third === "mid" || third === "late") &&
    value.levelParam === `${grade}-${third}`
    ? bandForGrade(grade)
    : null;
}

/**
 * Pure host adapter. Placement is advisory input only; the mathematical
 * engine remains authoritative for targets, scoring, and round outcomes.
 *
 * A canonical grade-third-v1 result must be internally consistent: only a
 * `band` result with a valid grade, third, and matching levelParam maps to a
 * game band. Below/above results and malformed or mismatched records remain
 * manual selection so a schema change can never silently choose a level.
 */
export function mapPlacementResultToBand(value: unknown): PlacementBand | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const signal = value as Record<string, unknown>;

  if ("kind" in signal || "band" in signal || "levelParam" in signal) {
    return mapGradeThirdSignal(signal);
  }

  if (signal.status !== "complete" || typeof signal.level !== "number") return null;
  if (!Number.isInteger(signal.level) || signal.level < 1 || signal.level > 8) return null;
  return bandForGrade(signal.level);
}
