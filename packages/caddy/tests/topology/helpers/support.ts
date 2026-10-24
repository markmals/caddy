// Assertions shared by the `helpers` suite's case modules.

import { primitives } from "@roonieone/occt-native";
import { expect } from "vite-plus/test";

import type { FixtureCase } from "../../../../../reference/build123d/oracle.ts";
import type { Location } from "../../../src/geometry/index.ts";
import type { Shape } from "../../../src/topology/index.ts";

import {
    expectVectorClose,
    fixtureRecord,
    fixtureValue,
    isClose,
} from "../../../../../reference/build123d/oracle.ts";
import {
    LINEAR_TOLERANCE,
    ORIENTATION_TOLERANCE,
} from "../../../../../reference/build123d/tolerances.ts";
import { Solid } from "../../../src/topology/index.ts";

/** Coordinate triples in the order Python's `sorted()` puts them in. */
export function sortedTriples(rows: Iterable<readonly number[]>): number[][] {
    return [...rows].map(row => [...row]).sort(compareRows);
}

/** Shape centres, sorted, as the Python `centers` helper writes them. */
export function sortedCenters(shapes: Iterable<Shape>): number[][] {
    return sortedTriples([...shapes].map(shape => shape.center().toTuple()));
}

function compareRows(first: readonly number[], second: readonly number[]): number {
    for (let index = 0; index < Math.max(first.length, second.length); index += 1) {
        let difference = (first[index] ?? 0) - (second[index] ?? 0);
        if (difference !== 0) return difference;
    }
    return 0;
}
/** A list of coordinate rows against a fixture list of the same shape. */
export function expectRows(
    expected: FixtureCase,
    key: string,
    actual: readonly (readonly number[])[],
    tolerance = LINEAR_TOLERANCE,
): void {
    let rows = fixtureValue(expected, key) as number[][];
    expect(actual.length, `${expected.name}.${key} length`).toBe(rows.length);
    for (let [index, row] of rows.entries()) {
        let mine = actual[index] as readonly number[];
        expect(mine.length, `${expected.name}.${key}[${index}] length`).toBe(row.length);
        for (let [position, value] of row.entries()) {
            expect(
                isClose(value, mine[position] as number, tolerance),
                `${expected.name}.${key}[${index}][${position}]: expected ${value}, got ${mine[position]}`,
            ).toBe(true);
        }
    }
}

/** Position and orientation of a location, as the `location` serializer writes them. */
export function expectLocationClose(expected: FixtureCase, key: string, actual: Location): void {
    let record = fixtureRecord(expected, key);
    expectVectorClose(record, "position", actual.position.toTuple(), LINEAR_TOLERANCE);
    expectVectorClose(record, "orientation", actual.orientation.toTuple(), ORIENTATION_TOLERANCE);
}

/** A box with one corner at `origin`, as `Solid.make_box` builds it. */
export function makeBox(
    length: number,
    width: number,
    height: number,
    origin: readonly [number, number, number] = [0, 0, 0],
): Solid {
    return new Solid(
        primitives.makeBox(length, width, height, {
            origin,
            zDirection: [0, 0, 1],
            xDirection: [1, 0, 0],
        }),
    );
}
