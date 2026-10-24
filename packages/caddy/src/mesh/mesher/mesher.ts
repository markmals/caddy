/**
 * Reading and writing 3MF meshes (build123d `Mesher`).
 *
 * A shape is triangulated once when it is added and kept as mesh data, so writing is pure
 * serialisation; reading rebuilds a face per triangle, sews them into shells and closes the
 * outermost one into a solid.
 */

import { construct, mesh as nativeMesh } from "@roonieone/occt-native";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { extname } from "node:path";

import type { Color } from "../../geometry/color.ts";
import type { Unit } from "../../io/types.ts";
import type { MeshType } from "./enums.ts";
import type { MeshGeometry, MeshObject, MetaDataEntry } from "./three-mf.ts";

import { ExportError, ImportError } from "../../errors.ts";
import { roundTo } from "../../geometry/rounding.ts";
import { Unit as Units } from "../../io/types.ts";
import { Compound, Shape, Shell, Solid } from "../../topology/index.ts";
import { MeshType as MeshTypes } from "./enums.ts";
import { parseModelXml, writeModelXml } from "./three-mf.ts";
import { readZip, writeZip } from "./zip.ts";

/** Per-shape meshing controls (build123d `Mesher.add_shape`). */
export interface AddShapeOptions {
    /** Largest distance between the mesh and the surface; defaults to 0.001. */
    readonly linearDeflection?: number;
    /** Largest angle, in radians, between neighbouring facets; defaults to 0.1. */
    readonly angularDeflection?: number;
    /** What the mesh is for when printed; defaults to {@link MeshType.Model}. */
    readonly meshType?: MeshType;
    readonly partNumber?: string;
    /** Identifier to store with the mesh; one is generated when omitted. */
    readonly uuid?: string;
}

/** What {@link Mesher#meshProperties} reports for one mesh. */
export interface MeshProperty {
    readonly name: string;
    readonly partNumber: string;
    readonly type: MeshType;
    readonly uuid: string;
}

const MODEL_PART = "3D/3dmodel.model";

const RELATIONSHIPS = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel" Target="/${MODEL_PART}" Id="rel0"/>
</Relationships>
`;

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
</Types>
`;

/** Vertices this close together are one vertex; build123d rounds to its `TOLERANCE`. */
const VERTEX_DIGITS = 6;

export class Mesher {
    #unit: Unit;
    #objects: MeshObject[] = [];
    #metaData: MetaDataEntry[] = [];

    constructor(options: { readonly unit?: Unit } = {}) {
        this.#unit = options.unit ?? Units.Millimeter;
    }

    /** The unit the model's coordinates are in. */
    get modelUnit(): Unit {
        return this.#unit;
    }

    get meshCount(): number {
        return this.#objects.length;
    }

    get vertexCounts(): number[] {
        return this.#objects.map(object => object.vertices.length);
    }

    get triangleCounts(): number[] {
        return this.#objects.map(object => object.triangles.length);
    }

    get meshProperties(): MeshProperty[] {
        return this.#objects.map(object => ({
            name: object.name,
            partNumber: object.partNumber,
            type: object.type,
            uuid: object.uuid,
        }));
    }

    /** Adds one entry to the model's metadata group. */
    addMetaData(
        nameSpace: string,
        name: string,
        value: string,
        type: string,
        options: { readonly mustPreserve?: boolean } = {},
    ): void {
        this.#metaData.push({
            nameSpace,
            name,
            value,
            type,
            mustPreserve: options.mustPreserve ?? false,
        });
    }

    get metaData(): MetaDataEntry[] {
        return [...this.#metaData];
    }

    /** The entry with this namespace and name; throws when the model has no such entry. */
    metaDataFor(nameSpace: string, name: string): MetaDataEntry {
        let found = this.#metaData.find(
            entry => entry.nameSpace === nameSpace && entry.name === name,
        );
        if (found === undefined) {
            throw new ImportError(`the model has no ${nameSpace}:${name} metadata`);
        }
        return found;
    }

    /**
     * Triangulates `shape` and keeps it as a mesh. A compound contributes its children, or, when
     * it carries no label or colour of its own, the shapes it holds.
     */
    async addShape(shape: Shape | Iterable<Shape>, options: AddShapeOptions = {}): Promise<void> {
        for (let target of flatten(shape)) {
            let geometry = await meshOf(target, options);
            if (geometry.vertices.length < 3 || geometry.triangles.length === 0) {
                process.emitWarning(`Degenerate shape ${target.toString()} - skipped`);
                continue;
            }
            this.#objects.push({
                ...geometry,
                name: target.label,
                partNumber: options.partNumber ?? "",
                type: options.meshType ?? MeshTypes.Model,
                uuid: options.uuid ?? randomUUID(),
                color: target.color,
            });
        }
    }

    /** The 3MF package as bytes (build123d `Mesher.write_stream`). */
    serialize(): Uint8Array {
        let model = writeModelXml({
            unit: this.#unit,
            metaData: this.#metaData,
            objects: this.#objects,
        });
        return writeZip([
            { name: "[Content_Types].xml", data: Buffer.from(CONTENT_TYPES, "utf-8") },
            { name: "_rels/.rels", data: Buffer.from(RELATIONSHIPS, "utf-8") },
            { name: MODEL_PART, data: Buffer.from(model, "utf-8") },
        ]);
    }

    async write(path: string): Promise<void> {
        if (extname(path).toLowerCase() !== ".3mf") {
            throw new ExportError(`Unknown file format ${extname(path)}`);
        }
        await writeFile(path, this.serialize());
    }

    /** Reads a 3MF package and rebuilds its meshes as solids, or shells when not watertight. */
    async read(source: string | Uint8Array): Promise<Shape[]> {
        if (typeof source === "string" && extname(source).toLowerCase() !== ".3mf") {
            throw new ImportError(`Unknown file format ${extname(source)}`);
        }
        let bytes = typeof source === "string" ? await readFile(source) : source;
        let part = readZip(bytes).get(MODEL_PART);
        if (part === undefined) {
            throw new ImportError(`the 3MF package has no ${MODEL_PART} part`);
        }
        let model = parseModelXml(new TextDecoder().decode(part));
        this.#unit = model.unit;
        this.#metaData = [...model.metaData];
        this.#objects.push(...model.objects);
        return model.objects.map(object => shapeOf(object));
    }
}

/**
 * build123d's `add_shape` flattening: a labelled or coloured compound is meshed as one object,
 * any other compound contributes the shapes it holds. (build123d prefers a compound's assembly
 * children, which Caddy has no equivalent of.)
 */
function flatten(shape: Shape | Iterable<Shape>): Shape[] {
    let inputs = shape instanceof Shape ? [shape] : [...shape];
    let shapes: Shape[] = [];
    for (let input of inputs) {
        if (!(input instanceof Compound) || input.label !== "" || input.color !== undefined) {
            shapes.push(input);
        } else {
            shapes.push(...input);
        }
    }
    return shapes;
}

async function meshOf(shape: Shape, options: AddShapeOptions): Promise<MeshGeometry> {
    let soup = await nativeMesh.tessellate(shape.wrapped, {
        tolerance: options.linearDeflection ?? 1e-3,
        angularTolerance: options.angularDeflection ?? 0.1,
    });
    return weldVertices(soup.positions, soup.indices);
}

/**
 * Faces are meshed one by one, so neighbouring faces repeat the vertices along their shared
 * edge. Rounding to build123d's tolerance folds those repeats into one vertex and drops the
 * triangles that collapse as a result.
 */
function weldVertices(positions: Float64Array, indices: Uint32Array): MeshGeometry {
    let vertices: [number, number, number][] = [];
    let byPosition = new Map<string, number>();
    let welded = new Uint32Array(positions.length / 3);
    for (let vertex = 0; vertex * 3 + 2 < positions.length; vertex += 1) {
        let point: [number, number, number] = [
            roundTo(positions[vertex * 3] ?? 0, VERTEX_DIGITS),
            roundTo(positions[vertex * 3 + 1] ?? 0, VERTEX_DIGITS),
            roundTo(positions[vertex * 3 + 2] ?? 0, VERTEX_DIGITS),
        ];
        let key = point.join(",");
        let existing = byPosition.get(key);
        if (existing === undefined) {
            existing = vertices.length;
            byPosition.set(key, existing);
            vertices.push(point);
        }
        welded[vertex] = existing;
    }
    let triangles: [number, number, number][] = [];
    for (let corner = 0; corner + 2 < indices.length; corner += 3) {
        let first = welded[indices[corner] ?? 0] ?? 0;
        let second = welded[indices[corner + 1] ?? 0] ?? 0;
        let third = welded[indices[corner + 2] ?? 0] ?? 0;
        if (first !== second && second !== third && third !== first) {
            triangles.push([first, second, third]);
        }
    }
    return { vertices, triangles };
}

/** One triangular face per triangle, sewn into shells; the outermost becomes a solid. */
function shapeOf(object: MeshObject): Shape {
    let faces = object.triangles
        .filter(triangle => triangleArea(object, triangle) > 0)
        .map(triangle => construct.makeFace(facetWire(object, triangle)));
    if (faces.length === 0) {
        throw new ImportError("a 3MF mesh has no usable triangles");
    }
    let sewed = Shape.cast(construct.sewFaces(faces));
    let shells = sewed instanceof Shell ? [sewed] : sewed.shells;
    let [first] = shells;
    if (first === undefined) {
        throw new ImportError("a 3MF mesh did not sew into a shell");
    }
    let outer = shells.reduce(
        (largest, candidate) => (boxVolume(candidate) > boxVolume(largest) ? candidate : largest),
        first,
    );
    let shape = outer.isManifold ? new Solid(outer) : outer;
    shape.label = object.name;
    shape.color = object.color;
    return shape;
}

function facetWire(object: MeshObject, triangle: readonly [number, number, number]) {
    return construct.makePolygonWire(
        triangle.map(corner => corners(object, corner)),
        true,
    );
}

function corners(object: MeshObject, corner: number): [number, number, number] {
    let point = object.vertices[corner];
    return point === undefined ? [0, 0, 0] : [point[0], point[1], point[2]];
}

function triangleArea(object: MeshObject, triangle: readonly [number, number, number]): number {
    let [first, second, third] = triangle.map(corner => corners(object, corner));
    let edge1 = subtract(second ?? [0, 0, 0], first ?? [0, 0, 0]);
    let edge2 = subtract(third ?? [0, 0, 0], first ?? [0, 0, 0]);
    return Math.hypot(
        edge1[1] * edge2[2] - edge1[2] * edge2[1],
        edge1[2] * edge2[0] - edge1[0] * edge2[2],
        edge1[0] * edge2[1] - edge1[1] * edge2[0],
    );
}

function subtract(
    left: readonly [number, number, number],
    right: readonly [number, number, number],
): [number, number, number] {
    return [left[0] - right[0], left[1] - right[1], left[2] - right[2]];
}

function boxVolume(shape: Shape): number {
    let size = shape.boundingBox.size;
    return size.x * size.y * size.z;
}

export type { Color, MeshGeometry, MeshObject, MetaDataEntry };
