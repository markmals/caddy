// Per-edge geometry the 2D vector exporters read: conic placement and the Bézier / B-spline
// decomposition of everything else.

import type { Shape, ShapeType, Vec3 } from "./types.ts";

import { addon } from "./addon.ts";

interface Export2DAddon {
    edgeConic(edge: Shape): Float64Array;
    edgeCurveIsClosed(edge: Shape): boolean;
    edgeBezierArcs(edge: Shape, degree: number, tolerance: number): Float64Array[];
    edgeBSpline(edge: Shape, degree: number, tolerance: number): EdgeBSpline;
    subShapesAvoiding(shape: Shape, kind: number, avoid: number): Shape[];
}

/** Placement and radii of a circular or elliptical edge. */
export interface EdgeConic {
    readonly kind: "circle" | "ellipse";
    readonly center: Vec3;
    /** Normal of the conic's plane; its sign decides which way an arc sweeps. */
    readonly zDirection: Vec3;
    /** Direction the conic's parameter 0 points at. */
    readonly xDirection: Vec3;
    readonly majorRadius: number;
    readonly minorRadius: number;
}

/** An edge approximated by a single B-spline (OCCT `Geom_BSplineCurve`). */
export interface EdgeBSpline {
    readonly degree: number;
    /** Control points, three numbers each. */
    readonly poles: Float64Array;
    /** Pole weights of a rational spline, otherwise `null`. */
    readonly weights: Float64Array | null;
    /** The knot sequence, with each knot repeated by its multiplicity. */
    readonly knots: Float64Array;
    /** Poles a periodic spline repeats at its end; 0 for a clamped spline. */
    readonly periodicPoleCount: number;
}

/** build123d `Shape.to_splines` defaults, which its 2D exporters rely on. */
export const SPLINE_DEGREE = 3;
export const SPLINE_TOLERANCE = 1e-3;

export function edgeConic(edge: Shape): EdgeConic | undefined {
    let values = addon<Export2DAddon>().edgeConic(edge);
    if (values.length === 0) return undefined;
    let at = (index: number): number => values[index] as number;
    return {
        kind: at(0) === 1 ? "circle" : "ellipse",
        center: [at(1), at(2), at(3)],
        zDirection: [at(4), at(5), at(6)],
        xDirection: [at(7), at(8), at(9)],
        majorRadius: at(10),
        minorRadius: at(11),
    };
}

export function edgeCurveIsClosed(edge: Shape): boolean {
    return addon<Export2DAddon>().edgeCurveIsClosed(edge);
}

/** One `Float64Array` of 2, 3 or 4 poles (`[x, y, z, ...]`) per Bézier arc, in parameter order. */
export function edgeBezierArcs(edge: Shape): Float64Array[] {
    return addon<Export2DAddon>().edgeBezierArcs(edge, SPLINE_DEGREE, SPLINE_TOLERANCE);
}

export function edgeBSpline(edge: Shape): EdgeBSpline {
    return addon<Export2DAddon>().edgeBSpline(edge, SPLINE_DEGREE, SPLINE_TOLERANCE);
}

/** Sub-shapes of `kind` that no shape of type `avoid` contains, in explorer order. */
export function subShapesAvoiding(shape: Shape, kind: ShapeType, avoid: ShapeType): Shape[] {
    return addon<Export2DAddon>().subShapesAvoiding(shape, kind, avoid);
}
