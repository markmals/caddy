/**
 * Asserts a Caddy shape against the `shape_metrics` record the oracle records for the equivalent
 * build123d shape. Everything is read through Caddy's own topology API, so a suite that passes has
 * exercised the port rather than the addon underneath it.
 */

import { expect } from "vite-plus/test";

import type { FixtureCase } from "../../../reference/build123d/oracle.ts";
import type { BoundingBox } from "../src/geometry/index.ts";
import type { Shape } from "../src/topology/index.ts";

import {
    expectClose,
    expectVectorClose,
    fixtureBoolean,
    fixtureNumber,
    fixtureRecord,
    fixtureString,
    fixtureValue,
} from "../../../reference/build123d/oracle.ts";
import { LINEAR_TOLERANCE, MASS_TOLERANCE } from "../../../reference/build123d/tolerances.ts";
import { CenterOf } from "../src/topology/index.ts";

export function expectShapeMetrics(expected: FixtureCase, shape: Shape): void {
    let metrics = fixtureRecord(expected, "shape");
    expect(shape.shapeType.toUpperCase(), "shape type").toBe(fixtureString(metrics, "shape_type"));
    expect(shape.isValid, "validity").toBe(fixtureBoolean(metrics, "is_valid"));
    expectBounds(fixtureRecord(metrics, "bounding_box"), shape.boundingBox());
    expectBounds(
        fixtureRecord(metrics, "bounding_box_coarse"),
        shape.boundingBox(undefined, false),
    );
    expectClose(metrics, "volume", shape.volume, MASS_TOLERANCE);
    expectClose(metrics, "area", shape.area, MASS_TOLERANCE);
    expectCenterOfMass(metrics, shape);
    expectCounts(fixtureRecord(metrics, "counts"), shape);
    expectGeomTypes(metrics, "face_geom_types", shape.faces());
    expectGeomTypes(metrics, "edge_geom_types", shape.edges());
}

function expectBounds(expected: FixtureCase, actual: BoundingBox): void {
    expectVectorClose(expected, "min", actual.min.toTuple(), LINEAR_TOLERANCE);
    expectVectorClose(expected, "max", actual.max.toTuple(), LINEAR_TOLERANCE);
}

/** The oracle records `null` for shapes whose centre of mass build123d refuses to compute. */
function expectCenterOfMass(metrics: FixtureCase, shape: Shape): void {
    if (fixtureValue(metrics, "center_of_mass") === null) return;
    let center = shape.center(CenterOf.Mass).toTuple();
    expectVectorClose(metrics, "center_of_mass", center, MASS_TOLERANCE);
}

function expectCounts(expected: FixtureCase, shape: Shape): void {
    let actual = {
        solids: shape.solids().length,
        shells: shape.shells().length,
        faces: shape.faces().length,
        wires: shape.wires().length,
        edges: shape.edges().length,
        vertices: shape.vertices().length,
    };
    for (let [name, count] of Object.entries(actual)) {
        expect(count, `${name} count`).toBe(fixtureNumber(expected, name));
    }
}

function expectGeomTypes(metrics: FixtureCase, key: string, entities: Iterable<Shape>): void {
    let histogram: Record<string, number> = {};
    for (let entity of entities) {
        histogram[entity.geomType] = (histogram[entity.geomType] ?? 0) + 1;
    }
    expect(histogram, key).toEqual(fixtureValue(metrics, key));
}
