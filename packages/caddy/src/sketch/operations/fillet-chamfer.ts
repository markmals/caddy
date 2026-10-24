/** Rounding and cutting the corners of a sketch (build123d's 2D `fillet` and `chamfer`). */

import type { Edge } from "../../topology/edge.ts";
import type { Shape } from "../../topology/shape.ts";
import type { Vertex } from "../../topology/vertex.ts";

import { chamferFace2D, filletFace2D } from "../../curves/fillet-chamfer-2d.ts";
import { GeometryError, InvalidShapeError } from "../../errors.ts";
import { DEG2RAD } from "../../geometry/constants.ts";
import { Sketch } from "../../topology/composite.ts";
import { Face } from "../../topology/face.ts";

/** The sketch the selected corners were taken from. */
function cornerParent(corners: readonly Vertex[], operation: string): Shape {
    if (corners.length === 0) {
        throw new GeometryError("No objects provided");
    }
    let parent = corners[0]!.topoParent;
    if (parent === undefined) {
        throw new InvalidShapeError(`Nothing to ${operation}`);
    }
    return parent;
}

/** Applies `change` to every face holding at least one of the corners, keeping the others. */
function reshapeFaces(
    parent: Shape,
    corners: readonly Vertex[],
    change: (face: Face, inFace: Vertex[]) => Face,
): Sketch {
    let faces = parent.faces().map(face => {
        let inFace = face
            .vertices()
            .filter(vertex => corners.some(corner => corner.isSame(vertex)));
        return inFace.length === 0 ? face : change(face, [...inFace]);
    });
    return new Sketch(faces);
}

/** Replaces the selected corners of a sketch with tangent arcs of `radius`. */
export function fillet2D(vertices: Iterable<Vertex>, radius: number): Sketch {
    let corners = [...vertices];
    let parent = cornerParent(corners, "fillet");
    return reshapeFaces(parent, corners, (face, inFace) => filletFace2D(face, radius, inFace));
}

export interface Chamfer2DOptions {
    /** Distance along the second edge of each corner; defaults to `length`. */
    readonly length2?: number;
    /** Angle in degrees the chamfer leaves the first edge at; an alternative to `length2`. */
    readonly angle?: number;
    /** Which edge of each corner `length` is measured along. */
    readonly reference?: Edge;
}

/** Cuts the selected corners of a sketch back by `length`. */
export function chamfer2D(
    vertices: Iterable<Vertex>,
    length: number,
    options: Chamfer2DOptions = {},
): Sketch {
    if (options.length2 !== undefined && options.angle !== undefined) {
        throw new GeometryError("Only one of length2 or angle should be provided");
    }
    if (
        options.reference !== undefined &&
        options.length2 === undefined &&
        options.angle === undefined
    ) {
        throw new GeometryError("reference can only be used in conjunction with length2 or angle");
    }
    let second =
        options.angle === undefined
            ? (options.length2 ?? length)
            : length * Math.tan(options.angle * DEG2RAD);
    let corners = [...vertices];
    let parent = cornerParent(corners, "chamfer");
    return reshapeFaces(parent, corners, (face, inFace) =>
        chamferFace2D(face, length, second, inFace, options.reference),
    );
}
