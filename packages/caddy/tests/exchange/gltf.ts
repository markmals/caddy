/**
 * Reading a glTF document back, mirroring `gltf_summary` in the oracle case module: what the
 * file means — names, counts, decoded numbers, buffer layout — rather than how it was laid out.
 */

const COMPONENT_SIZES: Readonly<Record<number, number>> = { 5123: 2, 5125: 4, 5126: 4 };
const TYPE_LENGTHS: Readonly<Record<string, number>> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };

interface Accessor {
    readonly bufferView: number;
    readonly byteOffset?: number;
    readonly componentType: number;
    readonly count: number;
    readonly type: string;
}

interface BufferView {
    readonly byteOffset?: number;
    readonly byteStride?: number;
    readonly target?: number;
}

interface Primitive {
    readonly attributes: Readonly<Record<string, number>>;
    readonly indices: number;
    readonly material?: number;
    readonly mode: number;
}

export interface GltfDocument {
    readonly asset: { readonly version: string };
    readonly scene: number;
    readonly scenes: readonly { readonly nodes: number[] }[];
    readonly nodes: readonly { name?: string; rotation?: number[]; mesh?: number }[];
    readonly meshes?: readonly { name?: string; primitives: Primitive[] }[];
    readonly materials?: readonly Record<string, unknown>[];
    readonly accessors: readonly Accessor[];
    readonly bufferViews: readonly BufferView[];
    readonly buffers: readonly { byteLength: number; uri?: string }[];
}

/** The GLB container around a document: everything a reader checks before the JSON. */
export interface GlbHeader {
    readonly magic: number;
    readonly version: number;
    readonly declaredLengthMatches: boolean;
    readonly chunkTypes: number[];
    readonly chunksPadded: boolean;
}

export interface GltfSummary {
    readonly assetVersion: string;
    readonly scene: number;
    readonly sceneNodes: number[];
    readonly nodeNames: (string | null)[];
    readonly nodeRotations: (number[] | null)[];
    readonly nodeMeshes: (number | null)[];
    readonly meshNames: (string | null)[];
    readonly primitiveCount: number;
    readonly primitiveModes: number[];
    readonly primitiveMaterials: (number | null)[];
    readonly materials: readonly Record<string, unknown>[] | null;
    readonly vertexCount: number;
    readonly triangleCount: number;
    readonly positions: number[][];
    readonly normals: number[][];
    readonly texcoords: number[][];
    readonly viewStrides: (number | null)[];
    readonly viewTargets: (number | null)[];
    readonly indexComponentTypes: number[];
}

/** The JSON form, whose buffer Caddy embeds as a data URI. */
export function readGltf(bytes: Uint8Array): { document: GltfDocument; binary: Uint8Array } {
    let document = JSON.parse(new TextDecoder().decode(bytes)) as GltfDocument;
    let uri = document.buffers[0]?.uri;
    if (uri === undefined) throw new Error("glTF buffer has no uri");
    return { document, binary: Buffer.from(uri.split(",", 2)[1] ?? "", "base64") };
}

export function readGlb(bytes: Uint8Array): {
    document: GltfDocument;
    binary: Uint8Array;
    header: GlbHeader;
} {
    let reader = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let chunks: { kind: number; payload: Uint8Array }[] = [];
    for (let offset = 12; offset < bytes.length;) {
        let length = reader.getUint32(offset, true);
        chunks.push({
            kind: reader.getUint32(offset + 4, true),
            payload: bytes.subarray(offset + 8, offset + 8 + length),
        });
        offset += 8 + length;
    }
    let json = new TextDecoder().decode(chunks[0]?.payload).trimEnd();
    return {
        document: JSON.parse(json) as GltfDocument,
        binary: chunks[1]?.payload ?? new Uint8Array(),
        header: {
            magic: reader.getUint32(0, true),
            version: reader.getUint32(4, true),
            declaredLengthMatches: reader.getUint32(8, true) === bytes.length,
            chunkTypes: chunks.map(chunk => chunk.kind),
            chunksPadded: chunks.every(chunk => chunk.payload.length % 4 === 0),
        },
    };
}

export function readAccessor(
    document: GltfDocument,
    binary: Uint8Array,
    index: number,
): number[][] {
    let accessor = document.accessors[index]!;
    let view = document.bufferViews[accessor.bufferView]!;
    let length = TYPE_LENGTHS[accessor.type]!;
    let size = COMPONENT_SIZES[accessor.componentType]!;
    let stride = view.byteStride ?? length * size;
    let start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
    let reader = new DataView(binary.buffer, binary.byteOffset, binary.byteLength);
    let read = (at: number): number =>
        accessor.componentType === 5126
            ? reader.getFloat32(at, true)
            : accessor.componentType === 5125
              ? reader.getUint32(at, true)
              : reader.getUint16(at, true);
    return Array.from({ length: accessor.count }, (_, element) =>
        Array.from({ length }, (_, component) => read(start + element * stride + component * size)),
    );
}

export function gltfSummary(document: GltfDocument, binary: Uint8Array): GltfSummary {
    let primitives = (document.meshes ?? []).flatMap(mesh => mesh.primitives);
    let positions: number[][] = [];
    let normals: number[][] = [];
    let texcoords: number[][] = [];
    let triangleCount = 0;
    for (let primitive of primitives) {
        positions.push(...readAccessor(document, binary, primitive.attributes["POSITION"]!));
        normals.push(...readAccessor(document, binary, primitive.attributes["NORMAL"]!));
        texcoords.push(...readAccessor(document, binary, primitive.attributes["TEXCOORD_0"]!));
        triangleCount += readAccessor(document, binary, primitive.indices).length / 3;
    }
    return {
        assetVersion: document.asset.version,
        scene: document.scene,
        sceneNodes: document.scenes[document.scene]?.nodes ?? [],
        nodeNames: document.nodes.map(node => node.name ?? null),
        nodeRotations: document.nodes.map(node => node.rotation ?? null),
        nodeMeshes: document.nodes.map(node => node.mesh ?? null),
        meshNames: (document.meshes ?? []).map(mesh => mesh.name ?? null),
        primitiveCount: primitives.length,
        primitiveModes: ascending(primitives.map(primitive => primitive.mode)),
        primitiveMaterials: primitives.map(primitive => primitive.material ?? null),
        materials: document.materials ?? null,
        vertexCount: positions.length,
        triangleCount,
        positions,
        normals,
        texcoords,
        viewStrides: document.bufferViews.map(view => view.byteStride ?? null),
        viewTargets: document.bufferViews.map(view => view.target ?? null),
        indexComponentTypes: ascending(
            primitives.map(primitive => document.accessors[primitive.indices]!.componentType),
        ),
    };
}

/** The distinct values of `values`, smallest first — what the oracle case records as a set. */
function ascending(values: readonly number[]): number[] {
    return [...new Set(values)].sort((first, second) => first - second);
}

/** Component-wise extent of a list of equally sized rows, as the oracle case records it. */
export function bounds(rows: readonly number[][]): { min: number[]; max: number[] } {
    let width = rows[0]?.length ?? 0;
    return {
        min: Array.from({ length: width }, (_, axis) => Math.min(...rows.map(row => row[axis]!))),
        max: Array.from({ length: width }, (_, axis) => Math.max(...rows.map(row => row[axis]!))),
    };
}
