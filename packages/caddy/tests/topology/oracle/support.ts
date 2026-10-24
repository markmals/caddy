import { expect } from "vite-plus/test";

import type {
    FixtureCase,
    OracleImplementation,
} from "../../../../../reference/build123d/oracle.ts";
import type { BoundingBox, Vector } from "../../../src/geometry/index.ts";
import type { Shape } from "../../../src/topology/index.ts";

import {
    expectClose,
    expectMatrixClose,
    expectNumbersClose,
    expectVectorClose,
    fixtureBoolean,
    fixtureNumber,
    fixtureRecord,
    fixtureString,
    fixtureValue,
} from "../../../../../reference/build123d/oracle.ts";
import {
    LINEAR_TOLERANCE,
    MASS_TOLERANCE,
    ORIENTATION_TOLERANCE,
} from "../../../../../reference/build123d/tolerances.ts";
import { CenterOf } from "../../../src/topology/index.ts";

/** One group of fixture-case implementations, keyed by case name. */
export type OracleCases = Record<string, OracleImplementation>;

/** Points in order, as the `_centers`/`vec`-list serializers write them. */
export function expectPoints(expected: FixtureCase, key: string, actual: readonly Vector[]): void {
    let rows = fixtureValue(expected, key);
    if (!Array.isArray(rows)) {
        throw new Error(`${expected.name}.${key}: expected a list of points`);
    }
    expect(actual.length, `${expected.name}.${key} length`).toBe(rows.length);
    if (actual.length === 0) return;
    expectMatrixClose(
        expected,
        key,
        actual.map(point => point.toTuple()),
        LINEAR_TOLERANCE,
    );
}

/** One point, as the `vec` serializer writes it. */
export function expectPoint(expected: FixtureCase, key: string, actual: Vector): void {
    expectVectorClose(expected, key, actual.toTuple(), LINEAR_TOLERANCE);
}

/** A batch of boolean predicates, naming the first one that disagrees. */
export function expectFlags(expected: FixtureCase, actual: Record<string, boolean>): void {
    for (let [key, value] of Object.entries(actual)) {
        expect(value, `${expected.name}.${key}`).toBe(fixtureBoolean(expected, key));
    }
}

/** Centres of `shapes`, in order. */
export function expectCenters(expected: FixtureCase, key: string, shapes: Iterable<Shape>): void {
    expectPoints(
        expected,
        key,
        Array.from(shapes, shape => shape.center),
    );
}

/** A list of measures (lengths, areas, radii, volumes), in order. */
export function expectMeasures(
    expected: FixtureCase,
    key: string,
    actual: readonly number[],
): void {
    expectNumbersClose(expected, key, actual, MASS_TOLERANCE);
}

/** A list of names: class names, shape types or geometry types. */
export function expectNames(expected: FixtureCase, key: string, actual: readonly string[]): void {
    expect(fixtureValue(expected, key), `${expected.name}.${key}`).toEqual(actual);
}

/** A single name: a class name, shape type, geometry type or convexity. */
export function expectName(expected: FixtureCase, key: string, actual: string): void {
    expect(actual, `${expected.name}.${key}`).toBe(fixtureString(expected, key));
}

/** An exact count. */
export function expectCount(expected: FixtureCase, key: string, actual: number): void {
    expect(actual, `${expected.name}.${key}`).toBe(fixtureNumber(expected, key));
}

/** A list of booleans, as a flag-per-element serializer writes it. */
export function expectFlagList(
    expected: FixtureCase,
    key: string,
    actual: readonly boolean[],
): void {
    expect(actual, `${expected.name}.${key}`).toEqual(fixtureValue(expected, key));
}

/** Points in the order Python's `sorted()` puts their `[x, y, z]` lists in. */
export function sortedPoints(points: readonly Vector[]): Vector[] {
    return [...points].sort(
        (first, second) => first.x - second.x || first.y - second.y || first.z - second.z,
    );
}

/** The six sub-shape counts of the `_counts` serializer. */
export function expectCounts(expected: FixtureCase, key: string, shape: Shape): void {
    let counts = fixtureRecord(expected, key);
    let actual = {
        vertices: shape.vertices.length,
        edges: shape.edges.length,
        wires: shape.wires.length,
        faces: shape.faces.length,
        shells: shape.shells.length,
        solids: shape.solids.length,
    };
    for (let [name, value] of Object.entries(actual)) {
        expect(value, `${expected.name}.${key}.${name}`).toBe(fixtureNumber(counts, name));
    }
}

/** `min`, `max` and `size` of a `_bounds` record. */
export function expectBoundsRecord(expected: FixtureCase, key: string, bounds: BoundingBox): void {
    let record = fixtureRecord(expected, key);
    expectVectorClose(record, "min", bounds.min.toTuple(), LINEAR_TOLERANCE);
    expectVectorClose(record, "max", bounds.max.toTuple(), LINEAR_TOLERANCE);
    expectVectorClose(record, "size", bounds.size.toTuple(), LINEAR_TOLERANCE);
}

/** `min` and `max` of the two-key bounds the `shape_metrics` serializer writes. */
function expectMetricBounds(expected: FixtureCase, key: string, bounds: BoundingBox): void {
    let record = fixtureRecord(expected, key);
    expectVectorClose(record, "min", bounds.min.toTuple(), LINEAR_TOLERANCE);
    expectVectorClose(record, "max", bounds.max.toTuple(), LINEAR_TOLERANCE);
}

function geomTypeHistogram(shapes: Iterable<Shape>): Record<string, number> {
    let histogram: Record<string, number> = {};
    for (let shape of shapes) {
        histogram[shape.geomType] = (histogram[shape.geomType] ?? 0) + 1;
    }
    return histogram;
}

/**
 * The whole `shape_metrics` record, read through Caddy's own accessors rather than the native
 * ones, so the suite covers `Shape`'s properties as well as the kernel's answers.
 */
export function expectShapeMetrics(expected: FixtureCase, key: string, shape: Shape): void {
    let metrics = fixtureRecord(expected, key);
    expect(shape.constructor.name, `${expected.name}.${key}.class_name`).toBe(
        fixtureString(metrics, "class_name"),
    );
    // `shape_metrics` records OCCT TopAbs constants, while Shape#shapeType uses build123d names.
    expect(shape.shapeType.toUpperCase(), `${expected.name}.${key}.shape_type`).toBe(
        fixtureString(metrics, "shape_type"),
    );
    expect(shape.isValid, `${expected.name}.${key}.is_valid`).toBe(
        fixtureBoolean(metrics, "is_valid"),
    );
    expectMetricBounds(metrics, "bounding_box", shape.boundingBox);
    expectMetricBounds(metrics, "bounding_box_coarse", shape.getBoundingBox({ optimal: false }));
    expectClose(metrics, "volume", shape.volume, MASS_TOLERANCE);
    expectClose(metrics, "area", shape.area, MASS_TOLERANCE);
    if (fixtureValue(metrics, "center_of_mass") !== null) {
        expectVectorClose(
            metrics,
            "center_of_mass",
            shape.getCenter(CenterOf.Mass).toTuple(),
            LINEAR_TOLERANCE,
        );
    }
    expectCounts(metrics, "counts", shape);
    expect(
        fixtureValue(metrics, "face_geom_types"),
        `${expected.name}.${key}.face_geom_types`,
    ).toEqual(geomTypeHistogram(shape.faces));
    expect(
        fixtureValue(metrics, "edge_geom_types"),
        `${expected.name}.${key}.edge_geom_types`,
    ).toEqual(geomTypeHistogram(shape.edges));
}

/** The `_placed` serializer: shape metrics plus the shape's location. */
export function expectPlaced(expected: FixtureCase, shape: Shape): void {
    expectShapeMetrics(expected, "shape", shape);
    let location = fixtureRecord(expected, "location");
    expectVectorClose(location, "position", shape.position.toTuple(), LINEAR_TOLERANCE);
    expectVectorClose(location, "orientation", shape.orientation.toTuple(), ORIENTATION_TOLERANCE);
    expectMatrixClose(location, "matrix", shape.location.transform.toRows(), LINEAR_TOLERANCE);
}
