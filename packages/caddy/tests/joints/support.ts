import { expect } from "vite-plus/test";

import type { FixtureCase } from "../../../../reference/build123d/oracle.ts";
import type { Location, Shape } from "../../src/index.ts";

import {
    expectMatrixClose,
    expectVectorClose,
    fixtureRecord,
    fixtureVector,
} from "../../../../reference/build123d/oracle.ts";
import {
    LINEAR_TOLERANCE,
    ORIENTATION_TOLERANCE,
} from "../../../../reference/build123d/tolerances.ts";
import { Align, Box } from "../../src/index.ts";

/** A box with its minimum corner at the origin, as the Python cases build one. */
export function cornerBox(length: number, width: number, height: number): Box {
    return new Box(length, width, height, {
        align: [Align.Min, Align.Min, Align.Min],
    });
}

/**
 * Compare against the oracle's `location()` record: position, orientation and transform.
 *
 * The transform is the rotation itself and is compared exactly. Euler angles are not unique at
 * a half turn — OCCT and Caddy may pick 180 where the other picks -180 — so the angles are
 * compared as directions on the circle.
 */
export function expectLocation(expected: FixtureCase, key: string, actual: Location): void {
    let record = fixtureRecord(expected, key);
    expectVectorClose(record, "position", actual.position.toTuple(), LINEAR_TOLERANCE);
    expectMatrixClose(record, "matrix", actual.transform.toRows(), LINEAR_TOLERANCE);
    let angles = fixtureVector(record, "orientation");
    for (let [axis, angle] of actual.orientation.toTuple().entries()) {
        let wanted = angles[axis]!;
        let gap = Math.abs(wanted - angle) % 360;
        expect(
            Math.min(gap, 360 - gap),
            `${expected.name}.${key}.orientation[${axis}]: expected ${wanted}, got ${angle}`,
        ).toBeLessThanOrEqual(ORIENTATION_TOLERANCE * Math.max(1, Math.abs(wanted)));
    }
}

/** Compare against the suite's `placement()` record: where a part sits and what it spans. */
export function expectPlacement(expected: FixtureCase, key: string, actual: Shape): void {
    let record = fixtureRecord(expected, key);
    expectLocation(record, "location", actual.location);
    let bounds = fixtureRecord(record, "bounding_box");
    let box = actual.boundingBox();
    expectVectorClose(bounds, "min", box.min.toTuple(), LINEAR_TOLERANCE);
    expectVectorClose(bounds, "max", box.max.toTuple(), LINEAR_TOLERANCE);
}
