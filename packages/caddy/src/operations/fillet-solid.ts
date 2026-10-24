import type { Shape as NativeShape } from "@roonieone/occt-native";

import { ShapeType, features, measure, shapes, topology } from "@roonieone/occt-native";

import type { Part } from "../topology/composite.ts";

import { GeometryError, InvalidShapeError, NativeKernelError } from "../errors.ts";
import { Edge } from "../topology/edge.ts";
import { Face } from "../topology/face.ts";
import { makeComposite } from "../topology/registry.ts";
import { Shape } from "../topology/shape.ts";

function selectedEdges(edges: Edge | Iterable<Edge>): Edge[] {
    let selection = edges instanceof Edge ? [edges] : [...edges];
    if (selection.length === 0 || selection.some(edge => !(edge instanceof Edge))) {
        throw new InvalidShapeError("At least one solid edge is required");
    }
    return selection;
}

function parentOf(edges: Edge[], target?: Shape): Shape {
    let parent = target ?? edges[0]?.topoParent;
    if (parent === undefined)
        throw new InvalidShapeError("The selected edges have no solid parent");
    if (parent.solids().length === 0) {
        throw new InvalidShapeError("Fillets and chamfers require a solid");
    }
    return parent;
}

function finishedPart(native: NativeShape, operation: string): Part {
    if (!measure.isValid(native)) throw new GeometryError(`${operation} produced an invalid solid`);
    return makeComposite([Shape.cast(native)], 3) as Part;
}

export function filletSolid(edges: Edge | Iterable<Edge>, radius: number, target?: Shape): Part {
    let selection = selectedEdges(edges);
    let parent = parentOf(selection, target);
    if (!Number.isFinite(radius) || radius <= 0) {
        throw new GeometryError("Fillet radius must be positive");
    }
    try {
        return finishedPart(
            features.fillet(
                parent.wrapped,
                selection.map(edge => edge.wrapped),
                radius,
            ),
            "Fillet",
        );
    } catch (cause) {
        if (cause instanceof GeometryError) throw cause;
        throw new NativeKernelError("Fillet failed; try a smaller radius", { cause });
    }
}

export interface ChamferSolidOptions {
    readonly length2?: number;
    readonly angle?: number;
    readonly reference?: Face;
    readonly target?: Shape;
}

export function chamferSolid(
    edges: Edge | Iterable<Edge>,
    length: number,
    options: ChamferSolidOptions = {},
): Part {
    let selection = selectedEdges(edges);
    let parent = parentOf(selection, options.target);
    if (options.length2 !== undefined && options.angle !== undefined) {
        throw new GeometryError("Specify either length2 or angle, not both");
    }
    if (!Number.isFinite(length) || length <= 0) {
        throw new GeometryError("Chamfer length must be positive");
    }
    let angle = options.angle === undefined ? undefined : (options.angle * Math.PI) / 180;
    let second = angle ?? options.length2 ?? length;
    if (!Number.isFinite(second) || second <= 0) {
        throw new GeometryError("Chamfer secondary dimension must be positive");
    }
    let references = selection.map(edge => {
        let adjacent = topology.ancestors(parent.wrapped, edge.wrapped, ShapeType.Face);
        let reference = options.reference?.wrapped ?? adjacent[0];
        if (reference === undefined || !adjacent.some(face => shapes.isSame(face, reference))) {
            throw new InvalidShapeError("Every chamfered edge must belong to its reference face");
        }
        return reference;
    });
    try {
        return finishedPart(
            features.chamfer(
                parent.wrapped,
                selection.map(edge => edge.wrapped),
                length,
                second,
                references,
                angle !== undefined,
            ),
            "Chamfer",
        );
    } catch (cause) {
        if (cause instanceof GeometryError) throw cause;
        throw new NativeKernelError("Chamfer failed; try a smaller length", { cause });
    }
}
