/** Arcs, circles and lines constrained by tangency, radius, centre or angle (build123d
 * `Edge.make_constrained_arcs` and `Edge.make_constrained_lines`). Everything is solved on the XY
 * plane. */

import type * as occt from "@roonieone/occt-native";

import { construct } from "@roonieone/occt-native";

import type { VectorLike } from "../geometry/vector.ts";
import type { Edge } from "../topology/edge.ts";
import type { Vertex } from "../topology/vertex.ts";
import type { Sagitta, Tangency } from "./enums.ts";

import { GeometryError } from "../errors.ts";
import { Axis } from "../geometry/axis.ts";
import { Vector } from "../geometry/vector.ts";
import { native } from "../topology/kernel.ts";
import { ShapeList } from "../topology/shape-list.ts";
import { Shape } from "../topology/shape.ts";
import { castEdge } from "./cast.ts";
import { Sagitta as SagittaOption, Tangency as TangencyOption } from "./enums.ts";

/**
 * Something a constrained curve must touch: a curve to be tangent to (optionally with a
 * {@link Tangency} qualifier) or a point to pass through.
 */
export type TangencyTarget = Edge | Axis | Vertex | VectorLike | readonly [Edge | Axis, Tangency];

export interface ConstrainedArcsOptions {
    readonly radius?: number;
    /** Fixed centre; with one target this gives whole circles. */
    readonly center?: VectorLike;
    /** Curve the solution's centre must lie on. */
    readonly centerOn?: Edge | Axis;
    /** Which of the two arcs between the contacts to keep; defaults to the shorter one. */
    readonly sagitta?: Sagitta;
}

const QUALIFIER_VALUES: Record<Tangency, number> = {
    UNQUALIFIED: 0,
    ENCLOSING: 1,
    ENCLOSED: 2,
    OUTSIDE: 3,
};

/** A target reduced to what the native solvers take: an edge with a qualifier, or a 2D point. */
type ResolvedTarget =
    | { readonly kind: "curve"; readonly edge: occt.Shape; readonly qualifier: number }
    | { readonly kind: "point"; readonly point: readonly [number, number] };

function isTangencyPair(target: TangencyTarget): target is readonly [Edge | Axis, Tangency] {
    return (
        Array.isArray(target) &&
        target.length === 2 &&
        (target[0] instanceof Axis || target[0] instanceof Shape)
    );
}

/** The unbounded line along an axis, which build123d represents as an infinite `Edge`. */
export function axisEdge(axis: Axis): Edge {
    let line = [...axis.position.toTuple(), ...axis.direction.toTuple()];
    return castEdge("Edge(Axis)", () => construct.makeAxisEdge(line));
}

function curveTarget(curve: Edge | Axis, qualifier: Tangency): ResolvedTarget {
    let edge = curve instanceof Axis ? axisEdge(curve) : curve;
    return { kind: "curve", edge: edge.wrapped, qualifier: QUALIFIER_VALUES[qualifier] };
}

function resolveTarget(target: TangencyTarget): ResolvedTarget {
    if (isTangencyPair(target)) {
        return curveTarget(target[0], target[1]);
    }
    if (target instanceof Axis) {
        return curveTarget(target, TangencyOption.Unqualified);
    }
    if (target instanceof Shape) {
        if (target.shapeType === "Edge") {
            return curveTarget(target as Edge, TangencyOption.Unqualified);
        }
        let position = target.center;
        return { kind: "point", point: [position.x, position.y] };
    }
    let position = Vector.from(target);
    return { kind: "point", point: [position.x, position.y] };
}

function targetArguments(targets: readonly TangencyTarget[]): construct.TangencyTargets {
    let resolved = targets.map(resolveTarget);
    let curves = resolved.filter(target => target.kind === "curve");
    let points = resolved.filter(target => target.kind === "point");
    return {
        edges: curves.map(target => target.edge),
        qualifiers: curves.map(target => target.qualifier),
        points: points.flatMap(target => [...target.point]),
    };
}

function centerOnEdge(centerOn: Edge | Axis): occt.Shape {
    return (centerOn instanceof Axis ? axisEdge(centerOn) : centerOn).wrapped;
}

/** Picks one arc of each `[minor, major]` solution pair, or keeps both. */
function selectSagitta(pairs: readonly occt.Shape[][], sagitta: Sagitta): ShapeList<Edge> {
    let selected = pairs.flatMap(pair => {
        let arcs = pair.map(arc => Shape.cast(arc) as Edge);
        if (sagitta === SagittaOption.Both) {
            return arcs;
        }
        let byLength = [...arcs].sort((left, right) => left.length - right.length);
        let chosen = sagitta === SagittaOption.Short ? byLength[0] : byLength[byLength.length - 1];
        return chosen === undefined ? [] : [chosen];
    });
    return new ShapeList(selected);
}

/**
 * Every planar arc satisfying the given constraints, as build123d's
 * `Edge.make_constrained_arcs`. The supported combinations are two targets with a `radius`, two
 * targets with `centerOn`, three tangent curves, one target with a fixed `center`, and one target
 * with both `radius` and `centerOn`; the last two produce whole circles.
 */
export function makeConstrainedArcs(
    targets: readonly TangencyTarget[],
    options: ConstrainedArcsOptions = {},
): ShapeList<Edge> {
    let solverTargets = targetArguments(targets);
    let count = solverTargets.edges.length + solverTargets.points.length / 2;
    if (count < 1 || count > 3) {
        throw new GeometryError("Provide 1 to 3 tangency targets");
    }
    let { radius, center, centerOn, sagitta = SagittaOption.Short } = options;
    if (radius !== undefined && radius <= 0) {
        throw new GeometryError("radius must be greater than 0");
    }

    if (count === 2 && radius !== undefined && center === undefined && centerOn === undefined) {
        return selectSagitta(
            native("Edge.makeConstrainedArcs", () =>
                construct.constrainedArcs2TanRad(solverTargets, radius),
            ),
            sagitta,
        );
    }
    if (count === 2 && centerOn !== undefined && radius === undefined && center === undefined) {
        let locus = centerOnEdge(centerOn);
        return selectSagitta(
            native("Edge.makeConstrainedArcs", () =>
                construct.constrainedArcs2TanOn(solverTargets, locus),
            ),
            sagitta,
        );
    }
    if (count === 3 && radius === undefined && center === undefined && centerOn === undefined) {
        return selectSagitta(
            native("Edge.makeConstrainedArcs", () => construct.constrainedArcs3Tan(solverTargets)),
            sagitta,
        );
    }
    if (count === 1 && center !== undefined && radius === undefined && centerOn === undefined) {
        let fixed = Vector.from(center);
        return castEdges("Edge.makeConstrainedArcs", () =>
            construct.constrainedCirclesTanCen(solverTargets, [fixed.x, fixed.y]),
        );
    }
    if (count === 1 && centerOn !== undefined && radius !== undefined) {
        let locus = centerOnEdge(centerOn);
        return castEdges("Edge.makeConstrainedArcs", () =>
            construct.constrainedCirclesTanOnRad(solverTargets, locus, radius),
        );
    }
    throw new GeometryError("Unsupported or ambiguous combination of arc constraints");
}

function castEdges(operation: string, solve: () => occt.Shape[]): ShapeList<Edge> {
    return new ShapeList(native(operation, solve).map(edge => Shape.cast(edge) as Edge));
}

/** Angle to the reference axis, given either in degrees or as a direction. */
export interface ConstrainedLinesOptions {
    readonly angle?: number;
    readonly direction?: VectorLike;
}

/**
 * Every planar line satisfying the given constraints, as build123d's
 * `Edge.make_constrained_lines`: tangent to two curves, tangent to a curve and through a point,
 * or tangent to a curve at an angle to a reference axis.
 */
export function makeConstrainedLines(
    first: TangencyTarget,
    second: TangencyTarget | Axis,
    options: ConstrainedLinesOptions = {},
): ShapeList<Edge> {
    let { angle, direction } = options;
    if (angle !== undefined && direction !== undefined) {
        throw new GeometryError("Provide either angle or direction, not both");
    }

    if (angle !== undefined || direction !== undefined) {
        if (!(second instanceof Axis)) {
            throw new GeometryError("An angled constrained line needs a reference Axis");
        }
        return obliqueLines(first, second, angleFrom(angle, direction));
    }

    let solverTargets = targetArguments([first, second as TangencyTarget]);
    if (solverTargets.edges.length === 0) {
        throw new GeometryError("The first tangency target must be a curve");
    }
    return castEdges("Edge.makeConstrainedLines", () =>
        construct.constrainedLines2Tan(solverTargets),
    );
}

function angleFrom(angle: number | undefined, direction: VectorLike | undefined): number {
    if (angle !== undefined) {
        return (angle * Math.PI) / 180;
    }
    let along = Vector.from(direction as VectorLike);
    return Math.atan2(along.y, along.x);
}

function obliqueLines(target: TangencyTarget, reference: Axis, angle: number): ShapeList<Edge> {
    if (Math.abs(Math.abs(reference.direction.z) - 1) < 1e-6) {
        throw new GeometryError("The reference Axis can't be perpendicular to the XY plane");
    }
    let solverTargets = targetArguments([target]);
    if (solverTargets.edges.length !== 1) {
        throw new GeometryError("An angled constrained line must be tangent to a curve");
    }
    let line = [
        reference.position.x,
        reference.position.y,
        reference.direction.x,
        reference.direction.y,
    ] as const;
    return castEdges("Edge.makeConstrainedLines", () =>
        construct.constrainedLinesTanOblique(solverTargets, line, angle),
    );
}
