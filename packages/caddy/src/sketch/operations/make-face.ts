/** Turning loose curves into sketch faces (build123d `make_face`, `make_hull`). */

import type { Edge } from "../../topology/edge.ts";
import type { Shape } from "../../topology/shape.ts";

import { makeConvexHull } from "../../curves/convex-hull.ts";
import { combineWires } from "../../curves/wire-makers.ts";
import { GeometryError } from "../../errors.ts";
import { Sketch } from "../../topology/composite.ts";
import { Face } from "../../topology/face.ts";

/** Anything a 2D operation accepts as a boundary: edges, wires, or compounds of them. */
export type CurveSource = Shape;

function boundaryEdges(curves: CurveSource | Iterable<CurveSource>, operation: string): Edge[] {
    let sources: CurveSource[] = Symbol.iterator in curves ? [...curves] : [curves];
    let edges = sources.flatMap(source => [...source.edges]);
    if (edges.length === 0) {
        throw new GeometryError(`No objects to create a ${operation}`);
    }
    return edges;
}

/** A face lies the right way up when its normal points along +Z. */
function facingUp(face: Face): Face {
    return face.normalAt().z < 0 ? face.reverseNormal() : face;
}

/** The face bounded by the first closed wire the curves form. */
export function makeFace(curves: CurveSource | Iterable<CurveSource>): Sketch {
    let wires = combineWires(boundaryEdges(curves, "face"));
    let outer = wires[0];
    if (outer === undefined) {
        throw new GeometryError("No objects to create a face");
    }
    return new Sketch([facingUp(new Face(outer))]);
}

/** The face bounded by the smallest outline enclosing every curve. */
export function makeHull(curves: CurveSource | Iterable<CurveSource>): Sketch {
    let hull = makeConvexHull(boundaryEdges(curves, "hull"));
    return new Sketch([facingUp(new Face(hull))]);
}
