/**
 * End-to-end exercise of the harness against the `selftest` fixture suite.
 *
 * The "implementations" here are plain TypeScript restatements of what the
 * build123d serializers must have produced, so a regression in the Python
 * serializers, the fixture writer or the TypeScript loader fails here first —
 * without depending on any Caddy API.
 */

import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect } from "vite-plus/test";

import type { FixtureCase } from "../oracle.ts";

import {
    expectClose,
    expectMatrixClose,
    expectVectorClose,
    fixtureBoolean,
    fixtureNumber,
    fixtureNumbers,
    fixtureRecord,
    fixtureString,
    fixtureValue,
    fixtureVector,
    oracleSuite,
} from "../oracle.ts";
import { EXACT_TOLERANCE, LINEAR_TOLERANCE, MASS_TOLERANCE } from "../tolerances.ts";

const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));

function cross(a: readonly number[], b: readonly number[]): [number, number, number] {
    let [ax = 0, ay = 0, az = 0] = a;
    let [bx = 0, by = 0, bz = 0] = b;
    return [ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx];
}

oracleSuite("selftest", {
    "serializer/vector": expected => {
        expectVectorClose(expected, "from_vector", [1, 2, 3], EXACT_TOLERANCE);
        expectVectorClose(expected, "from_tuple", [-0.5, 0.25, 1e-9], EXACT_TOLERANCE);
        expectVectorClose(expected, "sum", [5, 7, 9], EXACT_TOLERANCE);
        expectClose(expected, "length", Math.sqrt(14), EXACT_TOLERANCE);
    },

    "serializer/location": expected => {
        let location = fixtureRecord(expected, "location");
        expectVectorClose(location, "position", [1, 2, 3], LINEAR_TOLERANCE);
        expectVectorClose(location, "orientation", [10, 20, 30], LINEAR_TOLERANCE);

        // Row-major 3x4: rotation block then translation column.
        let matrix = fixtureMatrixRows(location);
        expect(matrix.map(row => row[3])).toEqual(fixtureVector(location, "position"));
        let [x = [], y = [], z = []] = matrix.map(row => row.slice(0, 3));
        for (let axis of [x, y, z]) {
            expectCloseTo(Math.hypot(...axis), 1);
        }
        // A pure rotation has an orthonormal, right-handed basis.
        expectCloseTo(dot(x, y), 0);
        expectCloseTo(dot(x, z), 0);
    },

    "serializer/plane": expected => {
        let plane = fixtureRecord(expected, "plane");
        expectVectorClose(plane, "origin", [0, 0, 2], LINEAR_TOLERANCE);
        let halfRoot2 = Math.SQRT1_2;
        expectVectorClose(plane, "x_dir", [halfRoot2, halfRoot2, 0], LINEAR_TOLERANCE);
        expectVectorClose(
            plane,
            "z_dir",
            cross(fixtureVector(plane, "x_dir"), fixtureVector(plane, "y_dir")),
            LINEAR_TOLERANCE,
        );
    },

    "metrics/box": expected => {
        let metrics = fixtureRecord(expected, "metrics");
        expect(fixtureString(metrics, "shape_type")).toBe("COMPOUND");
        expect(fixtureBoolean(metrics, "is_valid")).toBe(true);
        expectClose(metrics, "volume", 24, MASS_TOLERANCE);
        expectClose(metrics, "area", 52, MASS_TOLERANCE);
        expectVectorClose(metrics, "center_of_mass", [0, 0, 0], MASS_TOLERANCE);
        let box = fixtureRecord(metrics, "bounding_box");
        expectVectorClose(box, "min", [-1, -1.5, -2], LINEAR_TOLERANCE);
        expectVectorClose(box, "max", [1, 1.5, 2], LINEAR_TOLERANCE);
        expect(fixtureValue(metrics, "counts")).toEqual({
            solids: 1,
            shells: 1,
            faces: 6,
            wires: 6,
            edges: 12,
            vertices: 8,
        });
        expect(fixtureValue(metrics, "face_geom_types")).toEqual({ PLANE: 6 });
        expect(fixtureValue(metrics, "edge_geom_types")).toEqual({ LINE: 12 });
    },

    "metrics/wire": expected => {
        let metrics = fixtureRecord(expected, "metrics");
        expect(fixtureString(metrics, "shape_type")).toBe("WIRE");
        expectClose(metrics, "volume", 0, MASS_TOLERANCE);
        expectClose(metrics, "area", 0, MASS_TOLERANCE);
        expect(fixtureValue(metrics, "edge_geom_types")).toEqual({ CIRCLE: 1 });
        expect(fixtureValue(metrics, "face_geom_types")).toEqual({});
        // The coarse box is the one BRepBndLib pads by Precision::Confusion.
        let optimal = fixtureRecord(metrics, "bounding_box");
        let coarse = fixtureRecord(metrics, "bounding_box_coarse");
        expectVectorClose(optimal, "min", [-2, -2, 0], EXACT_TOLERANCE);
        expectVectorClose(optimal, "max", [2, 2, 0], EXACT_TOLERANCE);
        expectVectorClose(coarse, "min", [-2 - 1e-7, -2 - 1e-7, -1e-7], EXACT_TOLERANCE);
        expectVectorClose(coarse, "max", [2 + 1e-7, 2 + 1e-7, 1e-7], EXACT_TOLERANCE);
    },

    "metrics/vertex": expected => {
        let metrics = fixtureRecord(expected, "metrics");
        expect(fixtureString(metrics, "shape_type")).toBe("VERTEX");
        // `Vertex.center()` takes no `CenterOf`, so the serializer falls back to it.
        expectVectorClose(metrics, "center_of_mass", [1, 2, 3], LINEAR_TOLERANCE);
    },

    "assets/brep": expected => {
        let relative = fixtureString(expected, "brep");
        expect(relative).toBe("reference/build123d/fixtures/selftest/assets-brep-1.brep");
        let path = `${REPO_ROOT}${relative}`;
        expect(existsSync(path)).toBe(true);
        expect(readFileSync(path, "utf8")).toContain("CASCADE Topology V3");
    },

    "scalars/mixed": expected => {
        expect(fixtureNumber(expected, "integer")).toBe(42);
        expectClose(expected, "float", 1 / 3, EXACT_TOLERANCE);
        expectClose(expected, "negative_zero", 0, EXACT_TOLERANCE);
        expect(fixtureBoolean(expected, "true")).toBe(true);
        expect(fixtureBoolean(expected, "false")).toBe(false);
        expect(fixtureString(expected, "string")).toBe("plane");
        expect(fixtureValue(expected, "null")).toBeNull();
        expect(fixtureNumbers(expected, "numbers")).toEqual([1, 2.5, -3]);
        expectMatrixClose(
            expected,
            "matrix",
            [
                [1, 0, 0, 4],
                [0, 1, 0, 5],
                [0, 0, 1, 6],
            ],
            EXACT_TOLERANCE,
        );
        let nested = fixtureRecord(expected, "nested");
        expect(fixtureString(nested, "label")).toBe("nested");
        expectVectorClose(nested, "origin", [0, 0, 1], EXACT_TOLERANCE);
    },
});

function fixtureMatrixRows(location: FixtureCase): number[][] {
    let flat = fixtureNumbers(location, "matrix");
    expect(flat).toHaveLength(12);
    return [flat.slice(0, 4), flat.slice(4, 8), flat.slice(8, 12)];
}

function dot(a: readonly number[], b: readonly number[]): number {
    return a.reduce((total, value, index) => total + value * (b[index] ?? 0), 0);
}

function expectCloseTo(actual: number, expected: number): void {
    expect(Math.abs(actual - expected)).toBeLessThanOrEqual(LINEAR_TOLERANCE);
}
