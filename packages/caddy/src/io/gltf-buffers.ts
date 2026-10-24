/**
 * The binary half of a glTF document: the buffer every accessor reads from, and the accessors
 * themselves.
 *
 * The layout follows `RWGltf_CafWriter`'s — one interleaved-free view per attribute plus one for
 * the indices, and one accessor per face into each of them, so a primitive numbers its own
 * vertices from zero.
 */

import type * as occt from "@roonieone/occt-native";

const ARRAY_BUFFER = 34962;
const ELEMENT_ARRAY_BUFFER = 34963;
const FLOAT = 5126;
const UNSIGNED_SHORT = 5123;
const UNSIGNED_INT = 5125;

export interface Accessor {
    readonly bufferView: number;
    readonly byteOffset: number;
    readonly componentType: number;
    readonly count: number;
    readonly type: string;
    readonly min?: number[];
    readonly max?: number[];
}

export interface BufferView {
    readonly buffer: 0;
    readonly byteOffset: number;
    readonly byteLength: number;
    readonly byteStride?: number;
    readonly target: number;
}

export interface MeshBuffer {
    readonly binary: Uint8Array;
    readonly views: BufferView[];
    readonly accessors: Accessor[];
}

/** Rounds up to the four-byte boundary glTF wants every chunk and index block to start on. */
export function align4(length: number): number {
    return (length + 3) & ~3;
}

export function encodeBuffers(soup: occt.mesh.UvTriangles, scale: number): MeshBuffer {
    let positions = Float32Array.from(soup.positions, value => value * scale);
    let normals = Float32Array.from(soup.normals);
    // glTF puts the texture origin in the top-left corner, so V runs the other way than in
    // OCCT's surface parameters — the flip `RWGltf_CafWriter` applies too.
    let uvs = Float32Array.from(soup.uvs, (value, index) => (index % 2 === 0 ? value : 1 - value));
    let indices = encodeIndices(soup);

    let normalsAt = positions.byteLength;
    let uvsAt = normalsAt + normals.byteLength;
    let indicesAt = uvsAt + uvs.byteLength;
    let binary = new Uint8Array(indicesAt + indices.bytes.byteLength);
    binary.set(new Uint8Array(positions.buffer), 0);
    binary.set(new Uint8Array(normals.buffer), normalsAt);
    binary.set(new Uint8Array(uvs.buffer), uvsAt);
    binary.set(indices.bytes, indicesAt);

    let views: BufferView[] = [
        view(0, positions.byteLength, { byteStride: 12, target: ARRAY_BUFFER }),
        view(normalsAt, normals.byteLength, { byteStride: 12, target: ARRAY_BUFFER }),
        view(uvsAt, uvs.byteLength, { byteStride: 8, target: ARRAY_BUFFER }),
        view(indicesAt, indices.bytes.byteLength, { target: ELEMENT_ARRAY_BUFFER }),
    ];

    let accessors = [
        ...vertexAccessors(soup, 0, "VEC3", 12, positions),
        ...vertexAccessors(soup, 1, "VEC3", 12),
        ...vertexAccessors(soup, 2, "VEC2", 8),
        ...indices.accessors,
    ];
    return { binary, views, accessors };
}

function view(
    byteOffset: number,
    byteLength: number,
    extra: { byteStride?: number; target: number },
): BufferView {
    return { buffer: 0, byteOffset, byteLength, ...extra };
}

/**
 * One accessor per face into `bufferView`. Passing `bounds` adds the per-face minimum and
 * maximum glTF requires of a `POSITION` accessor.
 */
function vertexAccessors(
    soup: occt.mesh.UvTriangles,
    bufferView: number,
    type: string,
    stride: number,
    bounds?: Float32Array,
): Accessor[] {
    let accessors: Accessor[] = [];
    let start = 0;
    for (let count of soup.faceVertexCounts) {
        let extent = bounds === undefined ? {} : boundsOf(bounds, start, count);
        accessors.push({
            bufferView,
            byteOffset: start * stride,
            componentType: FLOAT,
            count,
            type,
            ...extent,
        });
        start += count;
    }
    return accessors;
}

function boundsOf(
    values: Float32Array,
    start: number,
    count: number,
): { min: number[]; max: number[] } {
    let min = [Infinity, Infinity, Infinity];
    let max = [-Infinity, -Infinity, -Infinity];
    for (let vertex = start; vertex < start + count; vertex += 1) {
        for (let axis = 0; axis < 3; axis += 1) {
            let value = values[vertex * 3 + axis]!;
            min[axis] = Math.min(min[axis]!, value);
            max[axis] = Math.max(max[axis]!, value);
        }
    }
    return { min, max };
}

function encodeIndices(soup: occt.mesh.UvTriangles): { bytes: Uint8Array; accessors: Accessor[] } {
    let width = (componentType: number): number => (componentType === UNSIGNED_INT ? 4 : 2);
    let accessors: Accessor[] = [];
    let byteLength = 0;
    for (let [face, vertexCount] of soup.faceVertexCounts.entries()) {
        let componentType = vertexCount > 0xffff ? UNSIGNED_INT : UNSIGNED_SHORT;
        let count = soup.faceTriangleCounts[face]! * 3;
        accessors.push({
            bufferView: 3,
            byteOffset: byteLength,
            componentType,
            count,
            type: "SCALAR",
        });
        byteLength = align4(byteLength + count * width(componentType));
    }

    let bytes = new Uint8Array(byteLength);
    let writer = new DataView(bytes.buffer);
    let vertexStart = 0;
    let corner = 0;
    for (let [face, accessor] of accessors.entries()) {
        for (let index = 0; index < accessor.count; index += 1, corner += 1) {
            let local = soup.indices[corner]! - vertexStart;
            let at = accessor.byteOffset + index * width(accessor.componentType);
            if (accessor.componentType === UNSIGNED_INT) writer.setUint32(at, local, true);
            else writer.setUint16(at, local, true);
        }
        vertexStart += soup.faceVertexCounts[face]!;
    }
    return { bytes, accessors };
}
