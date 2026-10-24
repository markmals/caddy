import { Orientation, shapes } from "@roonieone/occt-native";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { expect } from "vite-plus/test";

import type { FixtureCase } from "../../../../reference/build123d/oracle.ts";
import type { Face, Shape } from "../../src/index.ts";

import { fixtureString, fixtureValue, isClose } from "../../../../reference/build123d/oracle.ts";
import { LINEAR_TOLERANCE, MASS_TOLERANCE } from "../../../../reference/build123d/tolerances.ts";
import {
    Align,
    CADFileType,
    Circle,
    Face as FaceClass,
    GeomType,
    importCAD,
    Location,
    Plane,
    Pos,
    Rectangle,
    Sphere,
} from "../../src/index.ts";

/** Every name the generated statements reference, which the evaluator binds for them. */
const GENERATED_SCOPE = {
    Align,
    Circle,
    Face: FaceClass,
    GeomType,
    Location,
    Plane,
    Pos,
    Rectangle,
    Sphere,
};

const REPO_ROOT = fileURLToPath(new URL("../../../../", import.meta.url));

/** The two halves of build123d's `plane_sort_key`, read off a generated Python line. */
const PLACEMENT_NAME = /^(Plane\.\w+|Location)/;
const PLACEMENT_OFFSET = /\.offset\(([^)]+)\)/;

/** A mesh asset of the suite, by its repository-relative path. */
export async function meshFromAsset(path: string): Promise<Shape> {
    return importCAD(await readFile(`${REPO_ROOT}${path}`), { type: CADFileType.Brep });
}

/** The mesh a case shipped: the shape build123d read back out of the STL it wrote. */
export async function fixtureMesh(expected: FixtureCase): Promise<Shape> {
    return meshFromAsset(fixtureString(expected, "source"));
}

/** What a detected primitive is, independent of which face object carries it. */
export interface PrimitiveRecord {
    readonly geomType: string;
    readonly orientation: string;
    readonly area: number;
    readonly center: readonly [number, number, number];
    readonly min: readonly [number, number, number];
    readonly max: readonly [number, number, number];
    readonly radius: number | undefined;
}

export function primitiveOf(face: Face): PrimitiveRecord {
    let box = face.boundingBox;
    return {
        geomType: face.geomType,
        // A hole's cylinder comes back reversed, which is the only sign that the solid is
        // outside it rather than within; `Shape.orientation` is the Euler one, not this.
        orientation:
            shapes.orientation(face.wrapped) === Orientation.Reversed ? "REVERSED" : "FORWARD",
        area: face.area,
        center: face.center.toTuple(),
        min: box.min.toTuple(),
        max: box.max.toTuple(),
        radius: face.radius,
    };
}

/** The `detected` records of a case, in the order build123d returned them. */
export function expectedPrimitives(expected: FixtureCase): PrimitiveRecord[] {
    let entries = fixtureValue(expected, "detected");
    if (!Array.isArray(entries)) throw new Error("detected: expected an array of primitives");
    return entries.map((entry: unknown) => {
        let record = entry as Record<string, unknown>;
        let box = record["bounding_box"] as Record<string, unknown>;
        let radius = record["radius"];
        return {
            geomType: String(record["geom_type"]),
            orientation: String(record["orientation"]),
            area: Number(record["area"]),
            center: vector(record["center"]),
            min: vector(box["min"]),
            max: vector(box["max"]),
            radius: radius === null ? undefined : Number(radius),
        };
    });
}

/**
 * How far build123d's generated lines are ordered, as a list of run lengths.
 *
 * `plane_sort_key` only names the placement and its offset, so a run of lines sharing a key
 * carries no order of its own: build123d leaves it in detection order, which falls out of a
 * CPython `set` walk that Caddy does not reproduce. Each run is one group; a group's members
 * are compared as a set, everything coarser than that exactly.
 */
export function sortKeyGroups(code: readonly string[]): number[] {
    let sizes: number[] = [];
    let previous: string | undefined;
    for (let line of code) {
        let expression = line.slice(line.indexOf(" = ") + 3);
        let name = PLACEMENT_NAME.exec(expression)?.[1] ?? "ZZZ";
        let offset = PLACEMENT_OFFSET.exec(expression)?.[1] ?? "0";
        let key = `${name}@${Number(offset)}`;
        let last = sizes.length - 1;
        if (key === previous && last >= 0) sizes[last] = sizes[last]! + 1;
        else sizes.push(1);
        previous = key;
    }
    return sizes;
}

/**
 * Compare detected primitives against the fixture, group by group.
 *
 * The groups are ordered, so a primitive that landed on the wrong plane still fails; inside a
 * group every expected primitive has to be matched by exactly one detected primitive, which is
 * as much order as build123d's own output carries.
 */
export function expectPrimitives(
    actual: readonly PrimitiveRecord[],
    expected: readonly PrimitiveRecord[],
    groups: readonly number[],
): void {
    expect(actual.length, "detected count").toBe(expected.length);
    let start = 0;
    for (let [group, size] of groups.entries()) {
        let unmatched = expected.slice(start, start + size);
        for (let candidate of actual.slice(start, start + size)) {
            let index = unmatched.findIndex(entry => matches(candidate, entry));
            expect(
                index,
                `group ${group}: nothing expected matches ${JSON.stringify(candidate)}, ` +
                    `left: ${JSON.stringify(unmatched)}`,
            ).toBeGreaterThanOrEqual(0);
            unmatched.splice(index, 1);
        }
        start += size;
    }
}

/**
 * What a six-significant-digit round trip costs.
 *
 * Generated code writes every number as `%.6g`, so a rebuilt primitive is only as close as
 * those digits allow: each number is exact to 5e-6 of itself, and a primitive's area and
 * centre inherit that from the radius, the side lengths and the placement they were built
 * from. A centre is therefore allowed to move by this fraction of the primitive's own size
 * rather than of the coordinate, which may sit at zero. It is a tolerance on Caddy's own round
 * trip through its own formatter, not on anything build123d said.
 */
const SIX_DIGIT_TOLERANCE = 1e-5;

/**
 * Run the generated statements and check they rebuild the primitives they were written from.
 *
 * The point of the generated code is that a user can paste it back in, so the test executes it
 * rather than matching it against a string. A plane's statement builds a sketch, as build123d's
 * does, so each result is compared through its single face. A primitive the emitter could not
 * write out leaves a comment in its place, which builds nothing and is checked for shape.
 */
export function expectGeneratedCodeRebuilds(code: readonly string[], faces: readonly Face[]): void {
    expect(code.length, "one statement per primitive").toBe(faces.length);
    let names = code.map(line => /^let (\w+) = /.exec(line)?.[1]);
    let declared = names.filter(name => name !== undefined);
    expect(declared.length, "at least one statement").toBeGreaterThan(0);
    // The subject under test is source code, so it is run the way source is run: compiled in
    // a context holding exactly the names Caddy's emitter may reference.
    let built = runInNewContext(
        `(() => {\n${code.join("\n")}\nreturn [${declared.join(", ")}];\n})()`,
        { ...GENERATED_SCOPE },
    ) as Shape[];
    let rebuilt = new Map(built.map((shape, index) => [declared[index]!, shape]));

    for (let [index, name] of names.entries()) {
        if (name === undefined) {
            expect(code[index], "a line that builds nothing says why").toMatch(/^\/\/ \w+: \S/);
            continue;
        }
        let original = faces[index]!;
        let copy = rebuilt.get(name)!.face;
        expect(copy.geomType, `${name} geometry`).toBe(original.geomType);
        expect(isClose(original.area, copy.area, SIX_DIGIT_TOLERANCE), `${name} area`).toBe(true);
        let allowance = SIX_DIGIT_TOLERANCE * Math.max(1, original.boundingBox.diagonal);
        expect(copy.center.sub(original.center).length, `${name} centre`).toBeLessThanOrEqual(
            allowance,
        );
    }
}

function matches(actual: PrimitiveRecord, expected: PrimitiveRecord): boolean {
    let sameRadius =
        actual.radius === undefined || expected.radius === undefined
            ? actual.radius === expected.radius
            : isClose(expected.radius, actual.radius, MASS_TOLERANCE);
    return (
        actual.geomType === expected.geomType &&
        actual.orientation === expected.orientation &&
        isClose(expected.area, actual.area, MASS_TOLERANCE) &&
        closeVector(actual.center, expected.center) &&
        closeVector(actual.min, expected.min) &&
        closeVector(actual.max, expected.max) &&
        sameRadius
    );
}

function closeVector(
    actual: readonly [number, number, number],
    expected: readonly [number, number, number],
): boolean {
    return actual.every((value, axis) => isClose(expected[axis]!, value, LINEAR_TOLERANCE));
}

function vector(value: unknown): [number, number, number] {
    if (!Array.isArray(value) || value.length !== 3) {
        throw new Error(`expected a 3-vector, got ${JSON.stringify(value)}`);
    }
    return [Number(value[0]), Number(value[1]), Number(value[2])];
}
