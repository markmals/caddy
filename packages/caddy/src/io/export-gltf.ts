/**
 * glTF 2.0, ported from build123d's `export_gltf`.
 *
 * OCCT's own glTF writer needs RapidJSON, which Caddy's OCCT build leaves out, so the document
 * is assembled here from the same tessellation: one node carrying the Z-up to Y-up rotation,
 * one mesh, and one primitive per face with positions, normals and the face's raw surface
 * parameters as `TEXCOORD_0` — exactly what `RWGltf_CafWriter` emits with forced UV export.
 *
 * `binary` produces a GLB; the JSON form embeds its buffer as a data URI rather than writing a
 * sibling `.bin`, so a glTF is a single self-contained artefact like every other export.
 */

import { mesh } from "@roonieone/occt-native";

import type { Color } from "../geometry/color.ts";
import type { Shape } from "../topology/index.ts";
import type { GltfOptions } from "./types.ts";

import { ExportError } from "../errors.ts";
import { align4, encodeBuffers } from "./gltf-buffers.ts";
import { METERS_PER_UNIT, Unit } from "./types.ts";

const TRIANGLES = 4;
const GLB_MAGIC = 0x46546c67;
const JSON_CHUNK = 0x4e4f534a;
const BINARY_CHUNK = 0x004e4942;

/** glTF is Y-up where OCCT is Z-up, so the scene node turns the model a quarter turn about X. */
const Z_UP_TO_Y_UP: readonly number[] = [-Math.SQRT1_2, 0, 0, Math.SQRT1_2];

export async function encodeGltf(shape: Shape, options: GltfOptions): Promise<Uint8Array> {
    let soup = await mesh.tessellateWithUvs(
        shape.wrapped,
        {
            tolerance: options.tolerance ?? mesh.DEFAULT_MESH_OPTIONS.tolerance,
            angularTolerance:
                options.angularTolerance ?? mesh.DEFAULT_MESH_OPTIONS.angularTolerance,
        },
        true,
    );
    if (soup.faceVertexCounts.length === 0) {
        throw new ExportError("glTF needs at least one face to tessellate");
    }

    let { binary, views, accessors } = encodeBuffers(
        soup,
        METERS_PER_UNIT[options.unit ?? Unit.Millimeter],
    );
    let material = shape.color === undefined ? undefined : 0;
    let named = shape.label === "" ? {} : { name: shape.label };
    let document = {
        asset: { generator: "caddy", version: "2.0" },
        scene: 0,
        scenes: [{ nodes: [0] }],
        nodes: [{ ...named, rotation: Z_UP_TO_Y_UP, mesh: 0 }],
        meshes: [{ ...named, primitives: primitives(soup.faceVertexCounts.length, material) }],
        ...(shape.color === undefined ? {} : { materials: [pbrMaterial(shape.color)] }),
        accessors,
        bufferViews: views,
        buffers: [{ byteLength: binary.length }],
    };

    return options.binary === true ? packGlb(document, binary) : packJson(document, binary);
}

function primitives(faceCount: number, material: number | undefined): object[] {
    return Array.from({ length: faceCount }, (_, face) => ({
        attributes: {
            POSITION: face,
            NORMAL: faceCount + face,
            TEXCOORD_0: faceCount * 2 + face,
        },
        indices: faceCount * 3 + face,
        ...(material === undefined ? {} : { material }),
        mode: TRIANGLES,
    }));
}

/**
 * glTF stores colours as linear RGB floats; build123d, like OCCT, holds them as sRGB. A
 * translucent colour additionally asks for blending, and drops the metallic factor to zero so
 * the surface reads as tinted glass rather than tinted metal.
 */
function pbrMaterial(color: Color): object {
    let linear = (channel: number): number =>
        Math.fround(channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
    let alpha = Math.fround(color.alpha);
    let translucent = alpha < 1;
    return {
        name: "mat_0",
        pbrMetallicRoughness: {
            baseColorFactor: [linear(color.red), linear(color.green), linear(color.blue), alpha],
            ...(translucent ? { metallicFactor: 0 } : {}),
        },
        doubleSided: true,
        ...(translucent ? { alphaMode: "BLEND" } : {}),
    };
}

function packJson(document: object, binary: Uint8Array): Uint8Array {
    let uri = `data:application/octet-stream;base64,${Buffer.from(binary).toString("base64")}`;
    let buffers = [{ byteLength: binary.length, uri }];
    return new TextEncoder().encode(JSON.stringify({ ...document, buffers }));
}

function packGlb(document: object, binary: Uint8Array): Uint8Array {
    let json = padTo4(new TextEncoder().encode(JSON.stringify(document)), 0x20);
    let payload = padTo4(binary, 0);
    let bytes = new Uint8Array(12 + 8 + json.length + 8 + payload.length);
    let header = new DataView(bytes.buffer);
    header.setUint32(0, GLB_MAGIC, true);
    header.setUint32(4, 2, true);
    header.setUint32(8, bytes.length, true);
    header.setUint32(12, json.length, true);
    header.setUint32(16, JSON_CHUNK, true);
    bytes.set(json, 20);
    header.setUint32(20 + json.length, payload.length, true);
    header.setUint32(24 + json.length, BINARY_CHUNK, true);
    bytes.set(payload, 28 + json.length);
    return bytes;
}

function padTo4(bytes: Uint8Array, filler: number): Uint8Array {
    let padded = new Uint8Array(align4(bytes.length)).fill(filler);
    padded.set(bytes);
    return padded;
}
