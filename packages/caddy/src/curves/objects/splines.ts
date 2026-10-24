/** Free-form curve objects (build123d `Spline`, `Bezier`, `BSpline`, `Helix`). */

import type { VectorLike } from "../../geometry/vector.ts";

import { GeometryError } from "../../errors.ts";
import { Vector } from "../../geometry/vector.ts";
import { BaseEdgeObject } from "../base-object.ts";
import { makeBezier, makeBspline, makeHelix, makeSpline } from "../spline-makers.ts";

export interface SplineObjectOptions {
    /** A start and end tangent, or one per point; only their directions are used. */
    readonly tangents?: readonly VectorLike[];
    /** Lengths for the tangents; supplying them stops the tangents being auto-scaled. */
    readonly tangentScalars?: readonly number[];
    readonly periodic?: boolean;
}

/** A B-spline interpolating every point. */
export class Spline extends BaseEdgeObject {
    constructor(points: readonly VectorLike[], options: SplineObjectOptions = {}) {
        super(makeSpline(points, splineOptions(options)).wrapped);
    }
}

function splineOptions(options: SplineObjectOptions): {
    tangents?: readonly VectorLike[];
    periodic: boolean;
    scale: boolean;
} {
    let periodic = options.periodic ?? false;
    let scale = options.tangentScalars === undefined;
    if (options.tangents === undefined) return { periodic, scale };
    let scalars = options.tangentScalars ?? options.tangents.map(() => 1);
    if (scalars.length !== options.tangents.length) {
        throw new GeometryError("One tangent scalar is required for each tangent");
    }
    let tangents = options.tangents.map((tangent, index) =>
        Vector.from(tangent).normalized().multiply(scalars[index]!),
    );
    return { tangents, periodic, scale };
}

/** A Bezier curve through its control points, rational when weights are given. */
export class Bezier extends BaseEdgeObject {
    constructor(
        controlPoints: readonly VectorLike[],
        options: { readonly weights?: readonly number[] } = {},
    ) {
        super(makeBezier(controlPoints, options).wrapped);
    }
}

/** An exact B-spline from control points and a knot sequence. */
export class BSpline extends BaseEdgeObject {
    constructor(
        controlPoints: readonly VectorLike[],
        knots: readonly number[],
        degree: number,
        options: { readonly weights?: readonly number[]; readonly periodic?: boolean } = {},
    ) {
        super(makeBspline(controlPoints, knots, degree, options).wrapped);
    }
}

export interface HelixObjectOptions {
    readonly center?: VectorLike;
    readonly direction?: VectorLike;
    /** Apex half-angle in degrees; zero winds the helix around a cylinder. */
    readonly coneAngle?: number;
    readonly leftHand?: boolean;
}

/** A helix of `pitch` per turn rising to `height` around the axis through `center`. */
export class Helix extends BaseEdgeObject {
    constructor(pitch: number, height: number, radius: number, options: HelixObjectOptions = {}) {
        super(
            makeHelix(pitch, height, radius, {
                ...(options.center === undefined ? {} : { center: options.center }),
                ...(options.direction === undefined ? {} : { normal: options.direction }),
                coneAngle: options.coneAngle ?? 0,
                leftHand: options.leftHand ?? false,
            }).wrapped,
        );
    }
}
