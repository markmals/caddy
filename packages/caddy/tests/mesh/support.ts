import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { expect } from "vite-plus/test";

import type { FixtureCase } from "../../../../reference/build123d/oracle.ts";
import type { Tessellation } from "../../src/index.ts";
import type { Shape } from "../../src/topology/index.ts";

import {
    expectClose,
    expectVectorClose,
    fixtureNumber,
    fixtureRecord,
    fixtureString,
} from "../../../../reference/build123d/oracle.ts";
import { LINEAR_TOLERANCE, MASS_TOLERANCE } from "../../../../reference/build123d/tolerances.ts";
import { CADFileType, importCAD } from "../../src/io/index.ts";

const REPO_ROOT = fileURLToPath(new URL("../../../../", import.meta.url));

/** The BREP asset a case shipped, so both sides tessellate exactly the same geometry. */
export async function fixtureShape(expected: FixtureCase, key = "source"): Promise<Shape> {
    let bytes = await readFile(`${REPO_ROOT}${fixtureString(expected, key)}`);
    return importCAD(bytes, { type: CADFileType.Brep });
}

/** What a triangle soup means, independent of the order the mesher emitted it in. */
export interface SoupMetrics {
    vertexCount: number;
    triangleCount: number;
    min: [number, number, number];
    max: [number, number, number];
    area: number;
    volume: number;
}

export function soupMetrics(mesh: Tessellation): SoupMetrics {
    let min: [number, number, number] = [Infinity, Infinity, Infinity];
    let max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
    for (let vertex of mesh.vertices) {
        let point = vertex.toTuple();
        for (let axis = 0; axis < 3; axis += 1) {
            min[axis] = Math.min(min[axis]!, point[axis]!);
            max[axis] = Math.max(max[axis]!, point[axis]!);
        }
    }
    let area = 0;
    let volume = 0;
    for (let [first, second, third] of mesh.triangles) {
        let corner = mesh.vertices[first]!;
        let next = mesh.vertices[second]!;
        let last = mesh.vertices[third]!;
        area += next.sub(corner).cross(last.sub(corner)).length / 2;
        volume += corner.dot(next.cross(last));
    }
    return {
        vertexCount: mesh.vertices.length,
        triangleCount: mesh.triangles.length,
        min,
        max,
        area,
        volume: volume / 6,
    };
}

/** Compare against the suite's `soup_metrics()` record. */
export function expectSoup(expected: FixtureCase, key: string, mesh: Tessellation): void {
    let record = fixtureRecord(expected, key);
    let metrics = soupMetrics(mesh);
    expect(metrics.vertexCount, "vertex count").toBe(fixtureNumber(record, "vertex_count"));
    expect(metrics.triangleCount, "triangle count").toBe(fixtureNumber(record, "triangle_count"));
    let bounds = fixtureRecord(record, "bounding_box");
    expectVectorClose(bounds, "min", metrics.min, LINEAR_TOLERANCE);
    expectVectorClose(bounds, "max", metrics.max, LINEAR_TOLERANCE);
    expectClose(record, "area", metrics.area, MASS_TOLERANCE);
    expectClose(record, "volume", metrics.volume, MASS_TOLERANCE);
}
