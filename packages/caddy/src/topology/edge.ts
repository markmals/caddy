import type * as occt from "@roonieone/occt-native";

import { construct, query, ShapeType, shapes } from "@roonieone/occt-native";

import type { ArcOptions } from "../curves/edge-makers.ts";
import type {
    BsplineOptions,
    HelixOptions,
    SplineApproxOptions,
    SplineOptions,
} from "../curves/spline-makers.ts";
import type { Plane } from "../geometry/plane.ts";
import type { VectorLike } from "../geometry/vector.ts";
import type { CurvePosition } from "./mixin1d.ts";
import type { Shape } from "./shape.ts";
import type { ShapeOptions } from "./shape.ts";

import {
    makeCircle,
    makeEllipse,
    makeLine,
    makeTangentArc,
    makeThreePointArc,
} from "../curves/edge-makers.ts";
import { trimEdge, trimEdgeToLength, trimEdgeToOther } from "../curves/edge-trim.ts";
import {
    makeBezier,
    makeBspline,
    makeHelix,
    makeSpline,
    makeSplineApprox,
} from "../curves/spline-makers.ts";
import { GeometryError, InvalidShapeError } from "../errors.ts";
import { Axis } from "../geometry/axis.ts";
import { roundTo } from "../geometry/rounding.ts";
import { Vector } from "../geometry/vector.ts";
import { boundedMinimum } from "./bounded-minimum.ts";
import { fromVec3, toVec3 } from "./conversions.ts";
import { GeomType, PositionMode } from "./enums.ts";
import { native } from "./kernel.ts";
import { Mixin1D } from "./mixin1d.ts";
import { registerShapeConstructor } from "./registry.ts";

/** build123d's `TOLERANCE` and the decimals it corresponds to. */
const TOLERANCE = 1e-6;
const TOL_DIGITS = 6;
/** Subdivision depth of `paramAtPoint`'s fallback search. */
const MAX_SEARCH_DIVISIONS = 10;

const CURVE_GEOM_TYPES: Record<query.CurveType, GeomType> = {
    [query.CurveType.Line]: GeomType.Line,
    [query.CurveType.Circle]: GeomType.Circle,
    [query.CurveType.Ellipse]: GeomType.Ellipse,
    [query.CurveType.Hyperbola]: GeomType.Hyperbola,
    [query.CurveType.Parabola]: GeomType.Parabola,
    [query.CurveType.BezierCurve]: GeomType.Bezier,
    [query.CurveType.BSplineCurve]: GeomType.Bspline,
    [query.CurveType.OffsetCurve]: GeomType.Offset,
    [query.CurveType.OtherCurve]: GeomType.Other,
};

/** A bounded piece of a curve: the 1D building block of wires and faces (build123d `Edge`). */
export class Edge extends Mixin1D {
    static override readonly order: number = 1;

    constructor(wrapped: occt.Shape, options: ShapeOptions = {}) {
        super(wrapped, options);
    }

    override get geomType(): GeomType {
        return CURVE_GEOM_TYPES[query.curveType(this.wrapped)];
    }

    /** Centre of the underlying circle or ellipse. */
    get arcCenter(): Vector {
        let conic = query.curveConic(this.wrapped);
        if (conic === undefined) {
            throw new InvalidShapeError(`${this.geomType} has no arc center`);
        }
        return fromVec3(conic.center);
    }

    /** Radius of the underlying circle. */
    get radius(): number {
        let conic = query.curveConic(this.wrapped);
        if (conic?.kind !== "circle") {
            throw new InvalidShapeError("Shape could not be reduced to a circle");
        }
        return conic.radius;
    }

    /**
     * The OCCT curve parameter at a normalized arc-length `position` (0 start, 1 end of the
     * curve's parameter range, ignoring the edge's orientation).
     */
    paramAt(position: number): number {
        let info = query.curveInfo(this.wrapped);
        return query.curveParameterAtLength(this.wrapped, info.length * position, info.first);
    }

    curvePosition(position: number, mode: PositionMode = PositionMode.Parameter): CurvePosition {
        let forward = this.isForward;
        let info = query.curveInfo(this.wrapped);
        let fraction: number;
        if (mode === PositionMode.Parameter) {
            fraction = forward ? position : 1 - position;
        } else {
            let length = this.length;
            fraction = (forward ? position : length - position) / length;
        }
        let parameter = query.curveParameterAtLength(
            this.wrapped,
            info.length * fraction,
            info.first,
        );
        return { edge: this, parameter, forward };
    }

    /**
     * Normalized position (0..1 over the curve's parameter range) of `point`, which must lie on
     * the edge: a vertex's own parameter, else the projection onto the curve, else a bounded
     * numeric search (build123d `param_at_point`).
     */
    paramAtPoint(point: VectorLike): number {
        let target = Vector.from(point);
        let [first] = query.edgeRange(this.wrapped);
        let normalized = (parameter: number): number =>
            query.curveLengthBetween(this.wrapped, first, parameter) /
            query.curveInfo(this.wrapped).length;

        let vertices = this.vertices();
        let nearest = vertices.reduce((best, vertex) =>
            vertex.center().sub(target).length < best.center().sub(target).length ? vertex : best,
        );
        if (nearest.center().sub(target).length <= TOLERANCE) {
            return normalized(query.vertexParameterOnEdge(nearest.wrapped, this.wrapped));
        }

        let separation = this.distanceTo(target);
        if (Math.abs(separation) > TOLERANCE) {
            throw new GeometryError(
                `point (${target.toTuple().join(", ")}) is ${separation} from edge`,
            );
        }

        let parameter = query.projectPointOnEdge(this.wrapped, toVec3(target));
        let period = query.curveInfo(this.wrapped).period;
        if (period !== undefined) {
            parameter = first + pythonModulo(parameter - first, period);
        }
        let projected = normalized(parameter);
        if (this.positionAt(projected).sub(target).length < TOLERANCE) {
            return projected;
        }
        return this.#searchParameter(target);
    }

    /** build123d's fallback: minimize the distance over ever finer subdivisions of [0, 1]. */
    #searchParameter(target: Vector): number {
        let distanceAt = (u: number): number => this.positionAt(u).sub(target).length;
        for (let division = 0; division < MAX_SEARCH_DIVISIONS; division++) {
            let intervals = 2 ** division;
            let step = 1 / intervals;
            for (let i = 0; i < intervals; i++) {
                let found = boundedMinimum(distanceAt, i * step, (i + 1) * step, TOLERANCE / 2);
                let resolution = this.positionAt(found.x + TOLERANCE).sub(
                    this.positionAt(found.x - TOLERANCE),
                ).length;
                if (found.value < resolution) {
                    return roundTo(found.x, TOL_DIGITS);
                }
            }
        }
        throw new InvalidShapeError("Unable to find parameter, Edge is too complex");
    }

    /**
     * A copy with the opposite orientation (build123d `reversed()`). With `reconstruct` the
     * curve itself is rebuilt reversed instead of only flipping the edge's orientation flag.
     */
    reversed(options: { readonly reconstruct?: boolean } = {}): Edge {
        if (options.reconstruct !== true) {
            return this.withWrapped(native("Reverse", () => shapes.reversed(this.wrapped)));
        }
        let [first, last] = [this.paramAt(0), this.paramAt(1)];
        return this.withWrapped(
            native("Reverse curve", () => construct.reverseEdgeCurve(this.wrapped, first, last)),
        );
    }

    /** Whether this is an infinite line (build123d's test: a line longer than 1e100). */
    get isInfinite(): boolean {
        return this.geomType === GeomType.Line && this.length > 1e100;
    }

    /**
     * An infinite line trimmed to `halfLength` either side of its centre, as OCCT's booleans
     * need; any other edge is returned unchanged (build123d `Edge.trim_infinite`).
     */
    trimInfinite(halfLength: number): Edge {
        if (!this.isInfinite) return this;
        let origin = this.center();
        let direction = this.positionAt(1).sub(this.positionAt(0)).normalized();
        return makeLine(
            origin.sub(direction.multiply(halfLength)),
            origin.add(direction.multiply(halfLength)),
        );
    }

    /**
     * Whether two edges have the same geometry, rather than being the same topological edge
     * (build123d `Edge.geom_equal`). Lines are compared by their ends, circles and ellipses by
     * their radii, centre and axis; every other kind by sampled points, which build123d only
     * falls back to for curves it cannot read structurally.
     */
    geomEqual(
        other: Edge,
        options: { readonly tolerance?: number; readonly samples?: number } = {},
    ): boolean {
        let tolerance = options.tolerance ?? TOLERANCE;
        if (this.geomType !== other.geomType) return false;
        if (
            !this.positionAt(0).equals(other.positionAt(0)) ||
            !this.positionAt(1).equals(other.positionAt(1))
        ) {
            return false;
        }
        if (this.geomType === GeomType.Line) return true;

        let mine = query.curveConic(this.wrapped);
        let theirs = query.curveConic(other.wrapped);
        if (mine !== undefined && theirs !== undefined) {
            return (
                Math.abs(mine.radius - theirs.radius) < tolerance &&
                Math.abs(mine.minorRadius - theirs.minorRadius) < tolerance &&
                fromVec3(mine.center).equals(fromVec3(theirs.center)) &&
                fromVec3(mine.axis).equals(fromVec3(theirs.axis))
            );
        }
        let samples = options.samples ?? 5;
        for (let sample = 1; sample <= samples; sample++) {
            let position = sample / (samples + 1);
            if (!this.positionAt(position).equals(other.positionAt(position))) return false;
        }
        return true;
    }

    /** A straight edge between two points. */
    static makeLine(start: VectorLike, end: VectorLike): Edge {
        return makeLine(start, end);
    }

    /** A circle on `plane`, or the arc between two angles in degrees. */
    static makeCircle(radius: number, options?: ArcOptions): Edge {
        return makeCircle(radius, options);
    }

    /** An ellipse on `plane`, or the arc between two angles in degrees. */
    static makeEllipse(xRadius: number, yRadius: number, options?: ArcOptions): Edge {
        return makeEllipse(xRadius, yRadius, options);
    }

    static makeThreePointArc(start: VectorLike, middle: VectorLike, end: VectorLike): Edge {
        return makeThreePointArc(start, middle, end);
    }

    static makeTangentArc(start: VectorLike, tangent: VectorLike, end: VectorLike): Edge {
        return makeTangentArc(start, tangent, end);
    }

    /** A B-spline interpolating every point. */
    static makeSpline(points: readonly VectorLike[], options?: SplineOptions): Edge {
        return makeSpline(points, options);
    }

    /** A B-spline passing within a tolerance of every point. */
    static makeSplineApprox(points: readonly VectorLike[], options?: SplineApproxOptions): Edge {
        return makeSplineApprox(points, options);
    }

    static makeBezier(
        controlPoints: readonly VectorLike[],
        options?: { readonly weights?: readonly number[] },
    ): Edge {
        return makeBezier(controlPoints, options);
    }

    static makeBspline(
        controlPoints: readonly VectorLike[],
        knots: readonly number[],
        degree: number,
        options?: BsplineOptions,
    ): Edge {
        return makeBspline(controlPoints, knots, degree, options);
    }

    static makeHelix(pitch: number, height: number, radius: number, options?: HelixOptions): Edge {
        return makeHelix(pitch, height, radius, options);
    }

    /**
     * A straight edge between two others, `middle` of the way across. Opposed edges are read
     * back to front so the result is not truncated (build123d `Edge.make_mid_way`).
     */
    static makeMidWay(first: Edge, second: Edge, middle = 0.5): Edge {
        let firstAxis = new Axis(first.positionAt(0), first.tangentAt(0));
        let flip = firstAxis.isOpposite(new Axis(second.positionAt(0), second.tangentAt(0)));
        let between = [0, 1].map(end =>
            makeLine(first.positionAt(end), second.positionAt(flip ? 1 - end : end)).positionAt(
                middle,
            ),
        );
        return makeLine(between[0]!, between[1]!);
    }

    /** The section between two normalized positions, running from `start` to `end`. */
    trim(start: number, end: number): Edge {
        return trimEdge(this, start, end);
    }

    /** The section of the given arc length starting at a normalized position. */
    trimToLength(start: number, length: number): Edge {
        return trimEdgeToLength(this, start, length);
    }

    /**
     * The shortest section from this edge's start that reaches `other`, or `undefined` when they
     * never meet (build123d `Edge.trim_to_other`).
     */
    trimToOther(other: Shape | Axis | Plane): Edge | undefined {
        return trimEdgeToOther(this, other);
    }
}
/** Python's float `%`: C `fmod`, moved into the divisor's sign. */
function pythonModulo(value: number, divisor: number): number {
    let remainder = value % divisor;
    return remainder !== 0 && divisor < 0 !== remainder < 0 ? remainder + divisor : remainder;
}

registerShapeConstructor(ShapeType.Edge, wrapped => new Edge(wrapped));
