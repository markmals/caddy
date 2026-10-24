/**
 * Wavefront OBJ, ported from build123d's `export_obj`.
 *
 * OBJ is a triangle soup with optional per-vertex normals and texture coordinates. With
 * `includeUvs` (the default) every vertex gets all three and faces reference them as
 * `v/vt/vn`; without, the file is positions and faces only.
 */

import { mesh } from "@roonieone/occt-native";

import type { Vector } from "../geometry/vector.ts";
import type { Tessellation } from "../mesh/triangulation.ts";
import type { UvTessellation } from "../mesh/uv.ts";
import type { Shape } from "../topology/index.ts";
import type { ObjOptions } from "./types.ts";

export async function encodeObj(shape: Shape, options: ObjOptions): Promise<Uint8Array> {
    let tolerance = options.tolerance ?? mesh.DEFAULT_MESH_OPTIONS.tolerance;
    let angularTolerance = options.angularTolerance ?? mesh.DEFAULT_MESH_OPTIONS.angularTolerance;
    let lines =
        options.includeUvs === false
            ? positionsOnly(await shape.tessellate(tolerance, { angularTolerance }))
            : withUvs(
                  await shape.tessellateWithUvs(tolerance, {
                      angularTolerance,
                      atlasPacking: options.atlasPacking ?? true,
                      atlasGutter: options.atlasGutter ?? 0,
                  }),
              );
    return new TextEncoder().encode(`# Wavefront OBJ exported by caddy\n${lines.join("")}`);
}

function positionsOnly(tessellation: Tessellation): string[] {
    let lines = tessellation.vertices.map(vertex => `v ${triple(vertex)}\n`);
    for (let [first, second, third] of tessellation.triangles) {
        lines.push(`f ${first + 1} ${second + 1} ${third + 1}\n`);
    }
    return lines;
}

function withUvs(tessellation: UvTessellation): string[] {
    let lines = tessellation.vertices.map(vertex => `v ${triple(vertex)}\n`);
    for (let [u, v] of tessellation.uvs) {
        lines.push(`vt ${formatG9(u)} ${formatG9(v)}\n`);
    }
    for (let normal of tessellation.normals) {
        lines.push(`vn ${triple(normal)}\n`);
    }
    for (let corners of tessellation.triangles) {
        let references = corners.map(corner => `${corner + 1}/${corner + 1}/${corner + 1}`);
        lines.push(`f ${references.join(" ")}\n`);
    }
    return lines;
}

function triple(vector: Vector): string {
    return `${formatG9(vector.x)} ${formatG9(vector.y)} ${formatG9(vector.z)}`;
}

/**
 * C's `%.9g`, which is how build123d writes every number in an OBJ file: nine significant
 * digits, trailing zeroes dropped, and an exponent only outside `1e-5 .. 1e9`.
 */
function formatG9(value: number): string {
    if (!Number.isFinite(value)) {
        throw new RangeError(`cannot write ${value} to an OBJ file`);
    }
    if (value === 0) return "0";
    let [mantissa, power] = value.toExponential(8).split("e") as [string, string];
    let exponent = Number(power);
    if (exponent >= -4 && exponent < 9) {
        return trimZeroes(value.toFixed(Math.max(0, 8 - exponent)));
    }
    let sign = exponent < 0 ? "-" : "+";
    return `${trimZeroes(mantissa)}e${sign}${String(Math.abs(exponent)).padStart(2, "0")}`;
}

function trimZeroes(text: string): string {
    return text.includes(".") ? text.replace(/\.?0+$/, "") : text;
}
