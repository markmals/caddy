import { expect } from "vite-plus/test";

import type { FixtureCase } from "../../../../reference/build123d/oracle.ts";

import {
    expectClose,
    fixtureNumber,
    fixtureRecord,
    fixtureValue,
    oracleSuite,
} from "../../../../reference/build123d/oracle.ts";
import { MASS_TOLERANCE } from "../../../../reference/build123d/tolerances.ts";
import { detectPrimitives } from "../../src/index.ts";
import {
    expectedPrimitives,
    expectGeneratedCodeRebuilds,
    expectPrimitives,
    fixtureMesh,
    primitiveOf,
    sortKeyGroups,
} from "./support.ts";

/**
 * Every case runs the same comparison, so they share one body: the meshes differ, the contract
 * does not. What each one is for is written in `reference/build123d/cases/primitives.py`.
 */
const CASES = [
    "detect/box",
    "detect/cylinder",
    "detect/noisy-plate",
    "detect/plate-with-holes",
    "detect/rotated-plate",
    "detect/sphere",
];

async function detectsTheSamePrimitives(expected: FixtureCase): Promise<void> {
    let mesh = await fixtureMesh(expected);
    expect(mesh.faces.length, "mesh faces").toBe(
        fixtureNumber(fixtureRecord(expected, "mesh"), "face_count"),
    );

    let { faces, leftovers, code } = detectPrimitives(mesh);
    let groups = sortKeyGroups(fixtureStrings(expected, "code"));

    expectPrimitives(
        faces.map(face => primitiveOf(face)),
        expectedPrimitives(expected),
        groups,
    );

    expect(leftovers.length, "leftover count").toBe(fixtureNumber(expected, "leftover_count"));
    expectClose(
        expected,
        "leftover_area",
        leftovers.reduce((total, face) => total + face.area, 0),
        MASS_TOLERANCE,
    );
    expectGeneratedCodeRebuilds(code, faces);

    expectVariableNames(code, fixtureStrings(expected, "code"), groups);
}

/**
 * build123d names each statement after the shape it builds and numbers it by position, and
 * Caddy's emitter follows the same rule over its own expressions. Names are therefore
 * comparable, as far as the ordering goes: exactly across groups, as a set within one.
 */
function expectVariableNames(
    actual: readonly string[],
    expected: readonly string[],
    groups: readonly number[],
): void {
    expect(actual.length, "generated lines").toBe(expected.length);
    let byName = (first: string, second: string): number =>
        first < second ? -1 : Number(first > second);
    let actualNames = actual.map(line => /^(?:let |\/\/ )(\w+)/.exec(line)?.[1] ?? "");
    let expectedNames = expected.map(line => line.slice(0, line.indexOf(" = ")));
    let start = 0;
    for (let size of groups) {
        expect(actualNames.slice(start, start + size).sort(byName)).toEqual(
            expectedNames.slice(start, start + size).sort(byName),
        );
        start += size;
    }
}

function fixtureStrings(expected: FixtureCase, key: string): string[] {
    let value = fixtureValue(expected, key);
    if (!Array.isArray(value) || value.some(entry => typeof entry !== "string")) {
        throw new Error(`${key}: expected an array of strings`);
    }
    return value as string[];
}

oracleSuite("primitives", Object.fromEntries(CASES.map(name => [name, detectsTheSamePrimitives])));
