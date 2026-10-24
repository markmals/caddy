import { expect } from "vite-plus/test";

import type { FixtureCase } from "../../../../reference/build123d/oracle.ts";
import type { ObjOptions } from "../../src/io/types.ts";
import type { UvTessellation } from "../../src/mesh/uv.ts";
import type { Shape } from "../../src/topology/index.ts";
import type { GltfSummary } from "./gltf.ts";
import type { ObjRecords } from "./obj.ts";

import {
    expectMatrixClose,
    expectNumbersClose,
    fixtureNumber,
    fixtureRecord,
    fixtureString,
    fixtureValue,
    oracleSuite,
} from "../../../../reference/build123d/oracle.ts";
import {
    EXACT_TOLERANCE,
    NINE_DIGIT_TOLERANCE,
    SINGLE_PRECISION_TOLERANCE,
} from "../../../../reference/build123d/tolerances.ts";
import { Color } from "../../src/geometry/color.ts";
import { ApproxOption } from "../../src/io/export2d/index.ts";
import { CADFileType, serialize } from "../../src/io/index.ts";
import { fixtureShape } from "../io/metrics.ts";
import { bounds, gltfSummary, readGlb, readGltf } from "./gltf.ts";
import { parseObj } from "./obj.ts";

/** Every case starts from the BREP the oracle shipped, so both sides tessellate the same shape. */
async function objRecords(
    expected: FixtureCase,
    options: Omit<ObjOptions, "type"> = {},
): Promise<ObjRecords> {
    let shape = await fixtureShape(expected);
    return parseObj(await serialize(shape, { ...options, type: CADFileType.Obj }));
}

async function gltfOf(shape: Shape, binary = false): Promise<GltfSummary> {
    let bytes = await serialize(shape, { type: CADFileType.Gltf, binary });
    let read = binary ? readGlb(bytes) : readGltf(bytes);
    return gltfSummary(read.document, read.binary);
}

function expectCounts(expected: FixtureCase, actual: Record<string, readonly unknown[]>): void {
    let counts = fixtureRecord(expected, "counts");
    for (let [key, values] of Object.entries(actual)) {
        expect(`${key}=${values.length}`).toBe(`${key}=${fixtureNumber(counts, key)}`);
    }
}

function expectBounds(
    expected: FixtureCase,
    key: string,
    rows: readonly number[][],
    tolerance: number,
): void {
    let extent = bounds(rows);
    let record = fixtureRecord(expected, key);
    expectNumbersClose(record, "min", extent.min, tolerance);
    expectNumbersClose(record, "max", extent.max, tolerance);
}

function expectUvTessellation(expected: FixtureCase, actual: UvTessellation): void {
    let rows = (vectors: UvTessellation["normals"]): number[][] =>
        vectors.map(vector => vector.toTuple());
    expectMatrixClose(expected, "vertices", rows(actual.vertices), EXACT_TOLERANCE);
    expectMatrixClose(expected, "normals", rows(actual.normals), EXACT_TOLERANCE);
    expectMatrixClose(expected, "uvs", actual.uvs, EXACT_TOLERANCE);
    expect(actual.triangles).toEqual(fixtureValue(expected, "triangles"));
}

function expectSummary(expected: FixtureCase, actual: GltfSummary): void {
    let summary = fixtureRecord(expected, "summary");
    expect(actual.assetVersion).toBe(fixtureString(summary, "asset_version"));
    expect(actual.scene).toBe(fixtureNumber(summary, "scene"));
    expect(actual.sceneNodes).toEqual(fixtureValue(summary, "scene_nodes"));
    expect(actual.nodeNames).toEqual(fixtureValue(summary, "node_names"));
    expect(actual.nodeMeshes).toEqual(fixtureValue(summary, "node_meshes"));
    expect(actual.meshNames).toEqual(fixtureValue(summary, "mesh_names"));
    expect(actual.primitiveCount).toBe(fixtureNumber(summary, "primitive_count"));
    expect(actual.primitiveModes).toEqual(fixtureValue(summary, "primitive_modes"));
    expect(actual.primitiveMaterials).toEqual(fixtureValue(summary, "primitive_materials"));
    expect(actual.vertexCount).toBe(fixtureNumber(summary, "vertex_count"));
    expect(actual.triangleCount).toBe(fixtureNumber(summary, "triangle_count"));
    expect(actual.viewStrides).toEqual(fixtureValue(summary, "view_strides"));
    expect(actual.viewTargets).toEqual(fixtureValue(summary, "view_targets"));
    expect(actual.indexComponentTypes).toEqual(fixtureValue(summary, "index_component_types"));
    expectRotations(summary, actual.nodeRotations);

    expectBounds(summary, "position_bounds", actual.positions, SINGLE_PRECISION_TOLERANCE);
    expectBounds(summary, "normal_bounds", actual.normals, SINGLE_PRECISION_TOLERANCE);
    expectBounds(summary, "texcoord_bounds", actual.texcoords, SINGLE_PRECISION_TOLERANCE);
    expectMaterials(summary, actual.materials);
}

/** The Y-up quarter turn is built from `Math.SQRT1_2`, which lands an ULP off Python's value. */
function expectRotations(expected: FixtureCase, actual: readonly (number[] | null)[]): void {
    let rotations = fixtureValue(expected, "node_rotations") as (number[] | null)[];
    expect(actual.length).toBe(rotations.length);
    rotations.forEach((rotation, index) => {
        let turn = actual[index];
        if (rotation === null) {
            expect(turn).toBeNull();
            return;
        }
        rotation.forEach((value, axis) => expect(turn?.[axis] ?? NaN).toBeCloseTo(value, 12));
    });
}

/** Colours reach glTF as linear float32, so the factors compare numerically, the rest exactly. */
function expectMaterials(
    expected: FixtureCase,
    actual: readonly Record<string, unknown>[] | null,
): void {
    let materials = fixtureValue(expected, "materials") as Record<string, unknown>[] | null;
    if (materials === null) {
        expect(actual).toBeNull();
        return;
    }
    expect(actual?.length).toBe(materials.length);
    materials.forEach((material, index) => {
        let { pbrMetallicRoughness: pbr, ...rest } = material;
        let { pbrMetallicRoughness: minePbr, ...mineRest } = actual?.[index] ?? {};
        expect(mineRest).toEqual(rest);
        let { baseColorFactor, ...pbrRest } = pbr as Record<string, unknown>;
        let { baseColorFactor: mineFactor, ...minePbrRest } = minePbr as Record<string, unknown>;
        expect(minePbrRest).toEqual(pbrRest);
        expect(mineFactor).toHaveLength((baseColorFactor as number[]).length);
        (baseColorFactor as number[]).forEach((channel, axis) => {
            expect((mineFactor as number[])[axis] ?? NaN).toBeCloseTo(channel, 6);
        });
    });
}

oracleSuite("exchange", {
    "obj/box": async expected => {
        let records = await objRecords(expected);
        expectMatrixClose(expected, "vertices", records.vertices, NINE_DIGIT_TOLERANCE);
        expectMatrixClose(expected, "uvs", records.uvs, NINE_DIGIT_TOLERANCE);
        expectMatrixClose(expected, "normals", records.normals, NINE_DIGIT_TOLERANCE);
        expect(records.faces).toEqual(fixtureValue(expected, "faces"));
    },

    "obj/atlas-gutter": async expected => {
        let records = await objRecords(expected, {
            atlasGutter: fixtureNumber(expected, "atlas_gutter"),
        });
        expectMatrixClose(expected, "uvs", records.uvs, NINE_DIGIT_TOLERANCE);
    },

    "obj/no-atlas": async expected => {
        let records = await objRecords(expected, { atlasPacking: false });
        expectMatrixClose(expected, "uvs", records.uvs, NINE_DIGIT_TOLERANCE);
    },

    "obj/without-uvs": async expected => {
        let records = await objRecords(expected, { includeUvs: false });
        expectMatrixClose(expected, "vertices", records.vertices, NINE_DIGIT_TOLERANCE);
        expect(records.uvs).toEqual([]);
        expect(records.normals).toEqual([]);
        expect(records.faces).toEqual(fixtureValue(expected, "faces"));
    },

    "obj/cylinder": async expected => {
        let records = await objRecords(expected);
        expectCounts(expected, { ...records });
        expectBounds(expected, "vertex_bounds", records.vertices, NINE_DIGIT_TOLERANCE);
        expectBounds(expected, "uv_bounds", records.uvs, NINE_DIGIT_TOLERANCE);
        expectBounds(expected, "normal_bounds", records.normals, NINE_DIGIT_TOLERANCE);
    },

    "tessellate-uvs/box": async expected => {
        let shape = await fixtureShape(expected);
        expectUvTessellation(expected, await shape.tessellateWithUvs(1e-3));
    },

    "tessellate-uvs/no-atlas": async expected => {
        let shape = await fixtureShape(expected);
        let tessellation = await shape.tessellateWithUvs(1e-3, { atlasPacking: false });
        expectUvTessellation(expected, tessellation);
    },

    "tessellate-uvs/moved": async expected => {
        let shape = await fixtureShape(expected);
        expectUvTessellation(expected, await shape.tessellateWithUvs(1e-3));
    },

    "tessellate-uvs/cylinder": async expected => {
        let shape = await fixtureShape(expected);
        let { vertices, triangles, normals, uvs } = await shape.tessellateWithUvs(1e-3);
        expectCounts(expected, { vertices, triangles, normals, uvs });
        let rows = (points: typeof vertices): number[][] => points.map(point => point.toTuple());
        expectBounds(expected, "vertex_bounds", rows(vertices), EXACT_TOLERANCE);
        expectBounds(expected, "uv_bounds", uvs, EXACT_TOLERANCE);
        expectBounds(expected, "normal_bounds", rows(normals), EXACT_TOLERANCE);
    },

    "gltf/box": async expected => {
        let shape = await fixtureShape(expected);
        shape.label = fixtureString(expected, "label");
        shape.color = Color.fromTuple(fixtureValue(expected, "color") as number[]);
        expectSummary(expected, await gltfOf(shape));
    },

    "gltf/unnamed": async expected => {
        expectSummary(expected, await gltfOf(await fixtureShape(expected)));
    },

    "gltf/cylinder": async expected => {
        expectSummary(expected, await gltfOf(await fixtureShape(expected)));
    },

    "gltf/translucent": async expected => {
        let shape = await fixtureShape(expected);
        shape.color = Color.fromTuple(fixtureValue(expected, "color") as number[]);
        expectMaterials(expected, (await gltfOf(shape)).materials);
    },

    "gltf/binary": async expected => {
        let shape = await fixtureShape(expected);
        shape.label = fixtureString(expected, "label");
        let bytes = await serialize(shape, { type: CADFileType.Gltf, binary: true });
        let { document, binary, header } = readGlb(bytes);
        let expectedHeader = fixtureRecord(expected, "header");
        expect(header.magic).toBe(fixtureNumber(expectedHeader, "magic"));
        expect(header.version).toBe(fixtureNumber(expectedHeader, "version"));
        expect(header.declaredLengthMatches).toBe(true);
        expect(header.chunksPadded).toBe(true);
        expect(header.chunkTypes).toEqual(fixtureValue(expectedHeader, "chunk_types"));
        expectSummary(expected, gltfSummary(document, binary));
    },

    "approx-option/members": expected => {
        expect(Object.values(ApproxOption)).toEqual(fixtureValue(expected, "names"));
        expect(Object.keys(ApproxOption)).toEqual(["Arc", "None", "Spline"]);
    },
});
