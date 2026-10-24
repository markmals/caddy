/**
 * The `3D/3dmodel.model` part of a 3MF package: the core model XML plus the base materials of the
 * material extension, which is where build123d stores a shape's colour.
 *
 * Vertices are written with six decimals, which is all the precision the mesher keeps — it folds
 * vertices closer than build123d's tolerance together before the model is built.
 */

import type { Color } from "../../geometry/color.ts";
import type { XmlElement } from "../../io/import2d/xml.ts";
import type { Unit } from "../../io/types.ts";
import type { MeshType } from "./enums.ts";

import { ImportError } from "../../errors.ts";
import { Color as ColorValue } from "../../geometry/color.ts";
import { parseXml } from "../../io/import2d/xml.ts";
import {
    MESH_TYPE_NAMES,
    MeshType as MeshTypes,
    THREE_MF_UNITS,
    unitFromThreeMf,
} from "./enums.ts";

export interface MeshGeometry {
    readonly vertices: readonly (readonly [number, number, number])[];
    readonly triangles: readonly (readonly [number, number, number])[];
}

export interface MeshObject extends MeshGeometry {
    readonly name: string;
    readonly partNumber: string;
    readonly type: MeshType;
    readonly uuid: string;
    readonly color: Color | undefined;
}

/** One entry of the model's metadata group (build123d `Mesher.add_meta_data`). */
export interface MetaDataEntry {
    readonly nameSpace: string;
    readonly name: string;
    readonly type: string;
    readonly value: string;
    readonly mustPreserve: boolean;
}

export interface ThreeMfModel {
    readonly unit: Unit;
    readonly metaData: readonly MetaDataEntry[];
    readonly objects: readonly MeshObject[];
}

const CORE_NAMESPACE = "http://schemas.microsoft.com/3dmanufacturing/core/2015/02";
const MATERIAL_NAMESPACE = "http://schemas.microsoft.com/3dmanufacturing/material/2015/02";
const PRODUCTION_NAMESPACE = "http://schemas.microsoft.com/3dmanufacturing/production/2015/06";

export function writeModelXml(model: ThreeMfModel): string {
    let namespaces = [...new Set(model.metaData.map(entry => entry.nameSpace))].filter(
        uri => uri.length > 0,
    );
    let declarations = namespaces
        .map((uri, index) => ` xmlns:ns${index}="${escape(uri)}"`)
        .join("");
    let lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        `<model unit="${THREE_MF_UNITS[model.unit]}" xml:lang="en-US" xmlns="${CORE_NAMESPACE}"` +
            ` xmlns:m="${MATERIAL_NAMESPACE}" xmlns:p="${PRODUCTION_NAMESPACE}"${declarations}>`,
        ...model.metaData.map(entry => metaDataElement(entry, namespaces)),
        "  <resources>",
    ];
    let nextId = 1;
    let items: string[] = [];
    for (let object of model.objects) {
        let objectId = nextId;
        nextId += 1;
        let material = object.color === undefined ? undefined : nextId;
        if (material !== undefined) {
            lines.push(...materialGroup(material, object.color as Color));
            nextId += 1;
        }
        lines.push(...meshObject(objectId, material, object));
        items.push(`    <item objectid="${objectId}"/>`);
    }
    lines.push("  </resources>", "  <build>", ...items, "  </build>", "</model>", "");
    return lines.join("\n");
}

function metaDataElement(entry: MetaDataEntry, namespaces: readonly string[]): string {
    let prefix = entry.nameSpace.length === 0 ? "" : `ns${namespaces.indexOf(entry.nameSpace)}:`;
    return (
        `  <metadata name="${prefix}${escape(entry.name)}" type="${escape(entry.type)}"` +
        ` preserve="${entry.mustPreserve ? 1 : 0}">${escape(entry.value)}</metadata>`
    );
}

function materialGroup(id: number, color: Color): string[] {
    return [
        `    <basematerials id="${id}">`,
        `      <base name="${escape(color.toHex())}" displaycolor="${escape(color.toHex())}"/>`,
        "    </basematerials>",
    ];
}

function meshObject(id: number, material: number | undefined, object: MeshObject): string[] {
    let attributes = [`id="${id}"`];
    if (object.name.length > 0) attributes.push(`name="${escape(object.name)}"`);
    if (object.partNumber.length > 0) attributes.push(`partnumber="${escape(object.partNumber)}"`);
    attributes.push(`type="${MESH_TYPE_NAMES[object.type]}"`);
    if (object.uuid.length > 0) attributes.push(`p:UUID="${escape(object.uuid)}"`);
    if (material !== undefined) attributes.push(`pid="${material}"`, 'pindex="0"');
    return [
        `    <object ${attributes.join(" ")}>`,
        "      <mesh>",
        "        <vertices>",
        ...object.vertices.map(
            ([x, y, z]) => `          <vertex x="${number(x)}" y="${number(y)}" z="${number(z)}"/>`,
        ),
        "        </vertices>",
        "        <triangles>",
        ...object.triangles.map(
            ([first, second, third]) =>
                `          <triangle v1="${first}" v2="${second}" v3="${third}"/>`,
        ),
        "        </triangles>",
        "      </mesh>",
        "    </object>",
    ];
}

export function parseModelXml(text: string): ThreeMfModel {
    let root = parseXml(text);
    if (root.name !== "model") {
        throw new ImportError(`expected a 3MF <model> document, got <${root.name}>`);
    }
    let resources = root.children.find(child => child.name === "resources");
    let materials = new Map<string, XmlElement>();
    for (let child of resources?.children ?? []) {
        let id = child.attributes.get("id");
        if (child.name === "basematerials" && id !== undefined) materials.set(id, child);
    }
    let objects: MeshObject[] = [];
    for (let child of resources?.children ?? []) {
        if (child.name !== "object") continue;
        let mesh = child.children.find(grandchild => grandchild.name === "mesh");
        if (mesh === undefined) continue;
        objects.push(meshObjectOf(child, mesh, materials));
    }
    return {
        unit: unitFromThreeMf(root.attributes.get("unit") ?? "millimeter"),
        metaData: root.children
            .filter(child => child.name === "metadata")
            .map(child => metaDataOf(child, root)),
        objects,
    };
}

function meshObjectOf(
    element: XmlElement,
    mesh: XmlElement,
    materials: ReadonlyMap<string, XmlElement>,
): MeshObject {
    let vertices = mesh.children.find(child => child.name === "vertices");
    let triangles = mesh.children.find(child => child.name === "triangles");
    return {
        name: element.attributes.get("name") ?? "",
        partNumber: element.attributes.get("partnumber") ?? "",
        type: meshTypeOf(element.attributes.get("type")),
        uuid: element.attributes.get(`{${PRODUCTION_NAMESPACE}}UUID`) ?? "",
        color: colorOf(element, materials),
        vertices: (vertices?.children ?? []).map(vertex => [
            coordinate(vertex, "x"),
            coordinate(vertex, "y"),
            coordinate(vertex, "z"),
        ]),
        triangles: (triangles?.children ?? []).map(triangle => [
            index(triangle, "v1"),
            index(triangle, "v2"),
            index(triangle, "v3"),
        ]),
    };
}

/** An object's colour is the base material its `pid` and `pindex` point at. */
function colorOf(
    element: XmlElement,
    materials: ReadonlyMap<string, XmlElement>,
): Color | undefined {
    let group = materials.get(element.attributes.get("pid") ?? "");
    let base = group?.children.filter(child => child.name === "base")[
        Number.parseInt(element.attributes.get("pindex") ?? "0", 10)
    ];
    let display = base?.attributes.get("displaycolor");
    return display === undefined ? undefined : ColorValue.fromHex(display);
}

function metaDataOf(element: XmlElement, root: XmlElement): MetaDataEntry {
    let qualified = element.attributes.get("name") ?? "";
    let colon = qualified.indexOf(":");
    let prefix = colon < 0 ? "" : qualified.slice(0, colon);
    return {
        nameSpace: prefix.length === 0 ? "" : (root.namespaces.get(prefix) ?? prefix),
        name: colon < 0 ? qualified : qualified.slice(colon + 1),
        type: element.attributes.get("type") ?? "",
        value: element.text,
        mustPreserve: element.attributes.get("preserve") === "1",
    };
}

function meshTypeOf(value: string | undefined): MeshType {
    let name = (value ?? "model").toUpperCase();
    for (let type of Object.values(MeshTypes)) {
        if (type === name) return type;
    }
    throw new ImportError(`unknown 3MF object type ${value}`);
}

function coordinate(element: XmlElement, name: string): number {
    return Number.parseFloat(element.attributes.get(name) ?? "0");
}

function index(element: XmlElement, name: string): number {
    return Number.parseInt(element.attributes.get(name) ?? "0", 10);
}

function number(value: number): string {
    return value.toFixed(6).replace(/\.?0+$/, "");
}

function escape(text: string): string {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}
