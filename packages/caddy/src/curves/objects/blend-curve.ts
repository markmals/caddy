/** A Bézier transition between two curves (build123d `BlendCurve`). */

import type { VectorLike } from "../../geometry/vector.ts";
import type { Edge } from "../../topology/edge.ts";
import type { ContinuityLevel } from "../enums.ts";

import { GeometryError } from "../../errors.ts";
import { TOLERANCE } from "../../geometry/constants.ts";
import { Vector } from "../../geometry/vector.ts";
import { BaseEdgeObject } from "../base-object.ts";
import { makeLine } from "../edge-makers.ts";
import { ContinuityLevel as Continuity } from "../enums.ts";
import { makeBezier } from "../spline-makers.ts";

export interface BlendCurveOptions {
    /** How smoothly the blend joins its curves; defaults to matching curvature (C2). */
    readonly continuity?: ContinuityLevel;
    /** The endpoints to join, one on each curve; defaults to the closest pair. */
    readonly endPoints?: readonly [VectorLike, VectorLike];
    /** Multipliers on the end tangents, which tighten or slacken the blend. */
    readonly tangentScalars?: readonly [number, number];
}

/**
 * The curve joining two others: a straight line for C0, a cubic Bézier matching their tangents
 * for C1, or a quintic Bézier also matching their curvature for C2.
 */
export class BlendCurve extends BaseEdgeObject {
    constructor(first: Edge, second: Edge, options: BlendCurveOptions = {}) {
        let continuity = options.continuity ?? Continuity.C2;
        let scalars = options.tangentScalars ?? [1, 1];
        let curves: readonly [Edge, Edge] = [first, second];
        let ends = options.endPoints ?? closestEndPoints(first, second);
        let parameters = curves.map((curve, index) => endParameter(curve, ends[index]!));

        let startPosition = first.positionAt(parameters[0]!);
        let endPosition = second.positionAt(parameters[1]!);
        if (continuity === Continuity.C0) {
            super(makeLine(startPosition, endPosition).wrapped);
            return;
        }

        // `derivativeAt` is not normalized, so the curves' own speed sets the blend's tension
        // when no scalar is given.
        let startDerivative = first.derivativeAt(parameters[0]!, 1).multiply(scalars[0]);
        let endDerivative = second.derivativeAt(parameters[1]!, 1).multiply(scalars[1]);

        if (continuity === Continuity.C1) {
            super(
                makeBezier([
                    startPosition,
                    startPosition.add(startDerivative.multiply(1 / 3)),
                    endPosition.sub(endDerivative.multiply(1 / 3)),
                    endPosition,
                ]).wrapped,
            );
            return;
        }

        let startCurvature = first.derivativeAt(parameters[0]!, 2);
        let endCurvature = second.derivativeAt(parameters[1]!, 2);
        super(
            makeBezier([
                startPosition,
                startPosition.add(startDerivative.multiply(1 / 5)),
                startPosition
                    .add(startDerivative.multiply(2 / 5))
                    .add(startCurvature.multiply(1 / 20)),
                endPosition.sub(endDerivative.multiply(2 / 5)).add(endCurvature.multiply(1 / 20)),
                endPosition.sub(endDerivative.multiply(1 / 5)),
                endPosition,
            ]).wrapped,
        );
    }
}

/** The pair of endpoints, one from each curve, that sit closest together. */
function closestEndPoints(first: Edge, second: Edge): [Vector, Vector] {
    let pairs = first
        .vertices()
        .flatMap(start => second.vertices().map(end => [start.center(), end.center()] as const));
    let closest = pairs.reduce((best, pair) =>
        pair[0].sub(pair[1]).length < best[0].sub(best[1]).length ? pair : best,
    );
    return [closest[0], closest[1]];
}

/** Which end of the curve a blend point sits on, as a normalized position. */
function endParameter(curve: Edge, point: VectorLike): number {
    let target = Vector.from(point);
    if (target.sub(curve.positionAt(0)).length < TOLERANCE) {
        return 0;
    }
    if (target.sub(curve.positionAt(1)).length < TOLERANCE) {
        return 1;
    }
    throw new GeometryError("Blend end points must be at either the start or end of a curve");
}
