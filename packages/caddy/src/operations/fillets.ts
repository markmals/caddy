import type { Part, Sketch, Curve } from "../topology/composite.ts";

import { chamferWire2D, filletWire2D } from "../curves/fillet-chamfer-2d.ts";
import { GeometryError, InvalidShapeError } from "../errors.ts";
import { DEG2RAD } from "../geometry/constants.ts";
import { chamfer2D, fillet2D } from "../sketch/operations/fillet-chamfer.ts";
import { Edge } from "../topology/edge.ts";
import { Face } from "../topology/face.ts";
import { makeComposite } from "../topology/registry.ts";
import { Shape } from "../topology/shape.ts";
import { Vertex } from "../topology/vertex.ts";
import { Wire } from "../topology/wire.ts";
import { chamferSolid, filletSolid } from "./fillet-solid.ts";

/** Selected vertices round a sketch or a wire; selected edges round a solid. */
function selectionOf(objects: Edge | Vertex | Iterable<Edge | Vertex>): (Edge | Vertex)[] {
    let selection = objects instanceof Shape ? [objects] : [...objects];
    if (selection.length === 0)
        throw new InvalidShapeError("At least one edge or vertex is required");
    if (selection.some(object => !(object instanceof Edge) && !(object instanceof Vertex))) {
        throw new InvalidShapeError("Fillets and chamfers require edges or vertices");
    }
    return selection;
}

/** A vertex's topological parent is a wire for curves and a face/Sketch for sketches. */
function parentWire(vertices: readonly Vertex[]): Wire | undefined {
    let parent = vertices[0]?.topoParent;
    if (parent instanceof Wire) return parent;
    return parent?.dimension === 1 ? parent.wires()[0] : undefined;
}

export function fillet(edges: Edge | Iterable<Edge>, radius: number, target?: Shape): Part;
export function fillet(vertices: Vertex | Iterable<Vertex>, radius: number): Sketch | Curve;
export function fillet(
    objects: Edge | Vertex | Iterable<Edge | Vertex>,
    radius: number,
    target?: Shape,
): Part | Sketch | Curve {
    let selection = selectionOf(objects);
    if (selection.every((object): object is Vertex => object instanceof Vertex)) {
        let wire = parentWire(selection);
        if (wire === undefined) return fillet2D(selection, radius);
        let rounded = filletWire2D(wire, radius, selection);
        return makeComposite(rounded.edges(), 1) as Curve;
    }
    return filletSolid(selection as Edge[], radius, target);
}

export interface ChamferOptions {
    readonly length2?: number;
    readonly angle?: number;
    readonly reference?: Edge | Face;
    readonly target?: Shape;
}

export function chamfer(
    edges: Edge | Iterable<Edge>,
    length: number,
    options?: ChamferOptions,
): Part;
export function chamfer(
    vertices: Vertex | Iterable<Vertex>,
    length: number,
    options?: ChamferOptions,
): Sketch | Curve;
export function chamfer(
    objects: Edge | Vertex | Iterable<Edge | Vertex>,
    length: number,
    options: ChamferOptions = {},
): Part | Sketch | Curve {
    let selection = selectionOf(objects);
    if (selection.every((object): object is Vertex => object instanceof Vertex)) {
        if (options.length2 !== undefined && options.angle !== undefined) {
            throw new GeometryError("Specify either length2 or angle, not both");
        }
        if (options.reference instanceof Face) {
            throw new GeometryError("A sketch chamfer's reference must be an edge");
        }
        let reference = options.reference;
        let wire = parentWire(selection);
        if (wire === undefined) {
            return chamfer2D(selection, length, {
                ...(options.length2 === undefined ? {} : { length2: options.length2 }),
                ...(options.angle === undefined ? {} : { angle: options.angle }),
                ...(reference === undefined ? {} : { reference }),
            });
        }
        let second =
            options.angle === undefined
                ? (options.length2 ?? length)
                : length * Math.tan(options.angle * DEG2RAD);
        let beveled = chamferWire2D(wire, length, second, selection, reference);
        return makeComposite(beveled.edges(), 1) as Curve;
    }
    if (options.reference instanceof Edge) {
        throw new GeometryError("A solid chamfer's reference must be a face");
    }
    return chamferSolid(selection as Edge[], length, {
        ...(options.length2 === undefined ? {} : { length2: options.length2 }),
        ...(options.angle === undefined ? {} : { angle: options.angle }),
        ...(options.reference === undefined ? {} : { reference: options.reference }),
        ...(options.target === undefined ? {} : { target: options.target }),
    });
}
