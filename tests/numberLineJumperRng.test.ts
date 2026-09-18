import { describe, expect, it } from "vitest";
import { mulberry32, pickFrom, pickInt, shuffled } from "@/lib/games/shared/rng";

describe("deterministic random helpers", () => {
  it("produces repeatable, bounded streams for a seed", () => {
    const first = mulberry32(291);
    const second = mulberry32(291);
    const values = Array.from({ length: 20 }, () => first());

    expect(values).toEqual(Array.from({ length: 20 }, () => second()));
    expect(values.every((value) => value >= 0 && value < 1)).toBe(true);
    expect(Array.from({ length: 5 }, mulberry32(292))).not.toEqual(values.slice(0, 5));
  });

  it("chooses both inclusive endpoints for integer ranges", () => {
    expect(pickInt(() => 0, -3, 4)).toBe(-3);
    expect(pickInt(() => 0.999999, -3, 4)).toBe(4);
  });

  it("chooses list endpoints and returns a deterministic permutation without mutation", () => {
    const values = ["a", "b", "c"] as const;
    expect(pickFrom(() => 0, values)).toBe("a");
    expect(pickFrom(() => 0.999999, values)).toBe("c");

    const source = [1, 2, 3];
    const result = shuffled(() => 0, source);
    expect(result).toEqual([2, 3, 1]);
    expect(source).toEqual([1, 2, 3]);
    expect(shuffled(() => 0.999999, [1, 2, 3])).toEqual([1, 2, 3]);
    expect(shuffled(() => { throw new Error("single item needs no random draw"); }, [1])).toEqual([1]);
  });
});
