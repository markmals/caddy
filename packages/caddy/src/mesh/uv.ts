/**
 * Texture coordinates for a triangulated shape, ported from build123d's
 * `Shape.tessellate_with_uvs`.
 *
 * The addon hands back each node's raw parameters on the surface it came from. build123d
 * normalises those per face into `[0, 1]` and then — by default — packs every face into a single
 * texture atlas, each island sized by the face's real arc lengths so a texture keeps its scale
 * across the whole model. Both steps are pure arithmetic and live here.
 */

import type * as occt from "@roonieone/occt-native";

import { mesh as nativeMesh } from "@roonieone/occt-native";

import type { MeshOptions, Tessellation } from "./triangulation.ts";

import { Vector } from "../geometry/vector.ts";
import { packRectangles } from "../pack/pack2d.ts";
import { tessellationOf, vectorsOf } from "./triangulation.ts";

/** A `[u, v]` texture coordinate. */
export type UvCoordinate = [number, number];

/** build123d's `(vertices, triangles, normals, uvs)`, one normal and one UV per vertex. */
export interface UvTessellation extends Tessellation {
    readonly normals: Vector[];
    readonly uvs: UvCoordinate[];
}

/** How the UVs are laid out, on top of the deflection every meshing call takes. */
export interface UvMeshOptions extends MeshOptions {
    /**
     * Pack every face into one shared `[0, 1]` atlas rather than normalising each face over the
     * full square on its own. Defaults to `true`.
     */
    readonly atlasPacking?: boolean;
    /**
     * Empty margin kept around every island, in atlas units, so neighbours cannot bleed into
     * each other when the atlas is sampled with interpolation. Defaults to `0`.
     */
    readonly atlasGutter?: number;
}

/** build123d's `TOLERANCE`, below which it treats an extent as degenerate. */
const DEGENERATE_EXTENT = 1e-6;

/** A reversed face with UV nodes is the only one whose `u` build123d mirrors. */
const MIRRORED_FLAGS = nativeMesh.FACE_REVERSED | nativeMesh.FACE_HAS_UVS;

/** One face's UVs: where they start in the vertex list, and the face's physical size. */
interface UvIsland {
    readonly start: number;
    readonly count: number;
    readonly width: number;
    readonly height: number;
}

export function uvTessellationOf(
    soup: occt.mesh.UvTriangles,
    options: UvMeshOptions = {},
): UvTessellation {
    let { vertices, triangles } = tessellationOf(soup);
    let uvs = normalizedUvs(soup);
    let islands = uvIslands(soup);
    if (options.atlasPacking !== false && islands.length > 0) {
        packIntoAtlas(uvs, islands, options.atlasGutter ?? 0);
    }
    return { vertices, triangles, normals: vectorsOf(soup.normals), uvs };
}

/** Each face's parameters mapped into `[0, 1]`, mirrored in `u` when the face is reversed. */
function normalizedUvs(soup: occt.mesh.UvTriangles): UvCoordinate[] {
    let uvs: UvCoordinate[] = [];
    let node = 0;
    for (let face = 0; face < soup.faceVertexCounts.length; face += 1) {
        let mirrored = (soup.faceFlags[face]! & MIRRORED_FLAGS) === MIRRORED_FLAGS;
        let originU = soup.faceUvOrigins[face * 2]!;
        let originV = soup.faceUvOrigins[face * 2 + 1]!;
        let rangeU = soup.faceUvRanges[face * 2]!;
        let rangeV = soup.faceUvRanges[face * 2 + 1]!;
        for (let last = node + soup.faceVertexCounts[face]!; node < last; node += 1) {
            let u = (soup.uvs[node * 2]! - originU) / rangeU;
            let v = (soup.uvs[node * 2 + 1]! - originV) / rangeV;
            uvs.push([mirrored ? 1 - u : u, v]);
        }
    }
    return uvs;
}

function uvIslands(soup: occt.mesh.UvTriangles): UvIsland[] {
    let islands: UvIsland[] = [];
    let start = 0;
    for (let face = 0; face < soup.faceVertexCounts.length; face += 1) {
        let count = soup.faceVertexCounts[face]!;
        islands.push({
            start,
            count,
            width: soup.faceArcSizes[face * 2]!,
            height: soup.faceArcSizes[face * 2 + 1]!,
        });
        start += count;
    }
    return islands;
}

/**
 * Lays the islands out with the growing packer `pack` uses, scales the packed extent down into
 * `[0, 1]`, and rewrites every UV into the rectangle its face landed in.
 */
function packIntoAtlas(uvs: UvCoordinate[], islands: readonly UvIsland[], gutter: number): void {
    let placements = packRectangles(islands.map(island => [island.width, island.height]));
    let extent = 0;
    for (let [index, island] of islands.entries()) {
        let [x, y] = placements[index]!;
        extent = Math.max(extent, x + island.width, y + island.height);
    }
    let inverse = 1 / (extent < DEGENERATE_EXTENT ? 1 : extent);

    for (let [index, island] of islands.entries()) {
        let [x, y] = placements[index]!;
        let width = island.width * inverse;
        let height = island.height * inverse;
        let insetU = Math.min(gutter, width * 0.5);
        let insetV = Math.min(gutter, height * 0.5);
        let originU = x * inverse + insetU;
        let originV = y * inverse + insetV;
        width -= 2 * insetU;
        height -= 2 * insetV;
        for (let node = island.start; node < island.start + island.count; node += 1) {
            let [u, v] = uvs[node]!;
            uvs[node] = [u * width + originU, v * height + originV];
        }
    }
}
