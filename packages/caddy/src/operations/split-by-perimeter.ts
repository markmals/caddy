import { booleans, features } from "@roonieone/occt-native";

import type { Edge } from "../topology/edge.ts";
import type { Face } from "../topology/face.ts";
import type { Shell } from "../topology/shell.ts";
import type { Vertex } from "../topology/vertex.ts";
import type { Wire } from "../topology/wire.ts";

import { GeometryError, NativeKernelError } from "../errors.ts";
import { TOLERANCE } from "../geometry/constants.ts";
import { Keep } from "../topology/enums.ts";
import { ShapeList } from "../topology/shape-list.ts";
import { Shape } from "../topology/shape.ts";

/** One side of a perimeter split: a single surface, a sewn shell, several loose faces, or none. */
export type PerimeterSide = Face | Shell | ShapeList<Face> | undefined;

/**
 * build123d `Mixin2D.split_by_perimeter`: divides the faces of `target` into the part inside the
 * closed `perimeter` and the part outside it. Returns the requested side, or both of them with
 * `Keep.Both` as `[inside, outside]`.
 */
export function splitByPerimeter(
    target: Shape,
    perimeter: Edge | Wire,
    keep: Keep = Keep.Inside,
): PerimeterSide | [PerimeterSide, PerimeterSide] {
    if (keep !== Keep.Inside && keep !== Keep.Outside && keep !== Keep.Both) {
        throw new GeometryError("keep must be one of Keep.Inside, Keep.Outside or Keep.Both");
    }
    if (!perimeter.isClosed) throw new GeometryError("perimeter must be a closed wire or edge");

    let sides = splitSides(target, perimeterEdges(target, perimeter));
    let left = sewSide(sides.left);
    let right = sewSide(sides.right);
    let inside = closerToPerimeter(perimeter, left, right) ? left : right;
    let outside = inside === left ? right : left;
    if (keep === Keep.Both) return [inside, outside];
    return keep === Keep.Inside ? inside : outside;
}

function splitSides(target: Shape, cuts: readonly Edge[]): { left: Shape[]; right: Shape[] } {
    try {
        let split = features.splitByPerimeter(
            target.wrapped,
            cuts.map(edge => edge.wrapped),
        );
        return {
            left: split.left.map(piece => Shape.cast(piece)),
            right: split.right.map(piece => Shape.cast(piece)),
        };
    } catch (cause) {
        throw new NativeKernelError("Splitting by a perimeter failed", { cause });
    }
}

/**
 * The perimeter is handed to OCCT edge by edge, cut wherever it crosses a surface seam: a single
 * edge spanning the seam would otherwise leave the split open.
 */
function perimeterEdges(target: Shape, perimeter: Edge | Wire): Edge[] {
    let seams = target.faces.flatMap(face => [...face.seams]);
    let cuts: Edge[] = [];
    for (let edge of perimeter.edges) {
        let crossings: Vertex[] = [];
        for (let seam of seams) {
            let meeting = edge.intersect(seam);
            if (meeting === undefined) continue;
            for (let vertex of meeting.vertices) {
                let onEnd = edge.vertices.some(end => vertex.distanceTo(end) <= TOLERANCE);
                let known = crossings.some(other => vertex.distanceTo(other) <= TOLERANCE);
                if (!onEnd && !known) crossings.push(vertex);
            }
        }
        cuts.push(...splitAtVertices(edge, crossings));
    }
    return cuts;
}

function splitAtVertices(edge: Edge, vertices: readonly Vertex[]): Edge[] {
    let segments = [edge];
    for (let vertex of vertices) {
        segments = segments.flatMap(segment => {
            let interior =
                segment.distanceTo(vertex) <= TOLERANCE &&
                segment.vertices.every(end => vertex.distanceTo(end) > TOLERANCE);
            if (!interior) return [segment];
            return [...Shape.cast(booleans.split([segment.wrapped], [vertex.wrapped])).edges];
        });
    }
    return segments;
}

/** build123d keeps several pieces together as a shell when they sew into one. */
function sewSide(pieces: readonly Shape[]): PerimeterSide {
    if (pieces.length === 0) return undefined;
    if (pieces.length === 1) return pieces[0] as Face | Shell;
    let sewn = Shape.cast(features.sew(pieces.map(piece => piece.wrapped)));
    if (sewn.shapeType === "Shell") return sewn as Shell;
    return new ShapeList(pieces.flatMap(piece => [...piece.faces]));
}

/** The inside piece is the one whose boundary length is nearest the perimeter's own. */
function closerToPerimeter(
    perimeter: Edge | Wire,
    left: PerimeterSide,
    right: PerimeterSide,
): boolean {
    let boundary = (side: PerimeterSide): number =>
        side === undefined
            ? 0
            : [...sideShapes(side)]
                  .flatMap(shape => [...shape.edges])
                  .reduce((total, edge) => total + edge.length, 0);
    return (
        Math.abs(perimeter.length - boundary(left)) < Math.abs(perimeter.length - boundary(right))
    );
}

function sideShapes(side: Face | Shell | ShapeList<Face>): Iterable<Shape> {
    return side instanceof ShapeList ? side : [side];
}
