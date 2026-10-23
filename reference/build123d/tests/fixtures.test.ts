import { describe, expect, it } from "vite-plus/test";

import type { FixtureCase } from "../oracle.ts";

import {
    expectClose,
    expectMatrixClose,
    expectVectorClose,
    fixtureBoolean,
    fixtureMatrix,
    fixtureNumber,
    fixtureRecord,
    fixtureString,
    fixtureVector,
    isClose,
} from "../oracle.ts";
import { EXACT_TOLERANCE, LINEAR_TOLERANCE } from "../tolerances.ts";

function fixture(data: Record<string, unknown>): FixtureCase {
    return { suite: "demo", name: "a/one", path: "", data };
}

describe("fixture accessors", () => {
    it("throws on a missing key, listing what the case does contain", () => {
        expect(() => fixtureNumber(fixture({ volume: 1 }), "area")).toThrowError(
            /demo\/a\/one \[area\]: missing from fixture; available keys: volume/,
        );
    });

    it("throws when the fixture value has the wrong type", () => {
        expect(() => fixtureNumber(fixture({ volume: "24" }), "volume")).toThrowError(
            /demo\/a\/one \[volume\]: expected a finite number, got "24"/,
        );
        expect(() => fixtureString(fixture({ kind: 3 }), "kind")).toThrowError(/expected a string/);
        expect(() => fixtureBoolean(fixture({ valid: 1 }), "valid")).toThrowError(
            /expected a boolean/,
        );
        expect(() => fixtureVector(fixture({ p: [1, 2] }), "p")).toThrowError(
            /expected 3 components, got 2/,
        );
        expect(() => fixtureVector(fixture({ p: [1, 2, null] }), "p")).toThrowError(
            /\[p\]\[2\]: expected a finite number, got null/,
        );
    });

    it("reads nested records as case views that keep the key path", () => {
        let nested = fixtureRecord(fixture({ box: { min: [0, 0, 0] } }), "box");

        expect(nested.path).toBe("box");
        expect(fixtureVector(nested, "min")).toEqual([0, 0, 0]);
        expect(() => fixtureNumber(nested, "max")).toThrowError(/demo\/a\/one \[box\.max\]/);
        expect(() => fixtureRecord(fixture({ box: [1] }), "box")).toThrowError(
            /expected an object, got \[1\]/,
        );
    });

    it("reads matrices as rows, reshaping the flat row-major form", () => {
        let flat = fixture({ m: [1, 0, 0, 4, 0, 1, 0, 5, 0, 0, 1, 6] });

        expect(fixtureMatrix(flat, "m", { rows: 3, columns: 4 })).toEqual([
            [1, 0, 0, 4],
            [0, 1, 0, 5],
            [0, 0, 1, 6],
        ]);
        expect(() => fixtureMatrix(flat, "m")).toThrowError(/flat matrix needs an expected shape/);
        expect(() => fixtureMatrix(flat, "m", { rows: 4, columns: 4 })).toThrowError(
            /expected 4x4 values, got 12/,
        );
        expect(() => fixtureMatrix(fixture({ m: [[1, 2], [3]] }), "m")).toThrowError(
            /rows have inconsistent lengths/,
        );
    });
});

describe("comparison helpers", () => {
    it("accepts values within tolerance", () => {
        let data = fixture({ volume: 24, center: [0, 0, 0], m: [1, 0, 0, 2] });

        expectClose(data, "volume", 24 + 1e-7, LINEAR_TOLERANCE);
        expectVectorClose(data, "center", [0, 1e-13, -1e-13], EXACT_TOLERANCE);
        expectMatrixClose(data, "m", [[1, 0, 0, 2]], EXACT_TOLERANCE);
    });

    it("reports case, key, both values and the tolerance when a comparison fails", () => {
        let data = fixture({ volume: 24 });

        expect(() => expectClose(data, "volume", 24.5, EXACT_TOLERANCE)).toThrowError(
            /demo\/a\/one \[volume\]: expected 24, got 24.5 \(\|Δ\| = 0.5 > 2.4e-11, tolerance 1e-12\)/,
        );
    });

    it("locates the failing component of a vector or matrix", () => {
        let data = fixture({
            center: [1, 2, 3],
            m: [
                [1, 0],
                [0, 1],
            ],
        });

        expect(() => expectVectorClose(data, "center", [1, 2.5, 3], EXACT_TOLERANCE)).toThrowError(
            /\[center\]\[1\]: expected 2, got 2.5/,
        );
        expect(() =>
            expectMatrixClose(
                data,
                "m",
                [
                    [1, 0],
                    [0, 2],
                ],
                EXACT_TOLERANCE,
            ),
        ).toThrowError(/\[m\]\[1\]\[1\]: expected 1, got 2/);
        expect(() => expectVectorClose(data, "center", [1, 2], EXACT_TOLERANCE)).toThrowError(
            /expected a 3-component actual value/,
        );
    });

    it("scales the tolerance with the magnitude of the expected value", () => {
        expect(isClose(0, 1e-13, EXACT_TOLERANCE)).toBe(true);
        expect(isClose(0, 1e-11, EXACT_TOLERANCE)).toBe(false);
        expect(isClose(1e6, 1e6 + 1e-7, EXACT_TOLERANCE)).toBe(true);
        expect(isClose(1e6, 1e6 + 1e-4, EXACT_TOLERANCE)).toBe(false);
        expect(isClose(-0, 0, 0)).toBe(true);
    });
});
