/** Curve objects wrapping the 2D constraint solvers (build123d `ConstrainedArcs` and
 * `ConstrainedLines`). Both always produce a `Curve` holding one or more edges, so a selector can
 * narrow the solutions down without changing the result type. */

import type { Axis } from "../../geometry/axis.ts";
import type { Edge } from "../../topology/edge.ts";
import type { ShapeList } from "../../topology/shape-list.ts";
import type {
    ConstrainedArcsOptions,
    ConstrainedLinesOptions,
    TangencyTarget,
} from "../constrained.ts";

import { GeometryError } from "../../errors.ts";
import { BaseCurveObject } from "../base-object.ts";
import { makeConstrainedArcs, makeConstrainedLines } from "../constrained.ts";

/** Narrows the solutions a solver found; by default every solution is kept. */
export type SolutionSelector = (solutions: ShapeList<Edge>) => Edge | readonly Edge[];

export interface ConstrainedArcsObjectOptions extends ConstrainedArcsOptions {
    readonly selector?: SolutionSelector;
}

export interface ConstrainedLinesObjectOptions extends ConstrainedLinesOptions {
    readonly selector?: SolutionSelector;
}

function selected(solutions: ShapeList<Edge>, selector: SolutionSelector | undefined): Edge[] {
    let kept = selector === undefined ? solutions : selector(solutions);
    let edges = Array.isArray(kept) ? (kept as readonly Edge[]) : [kept as Edge];
    if (edges.length === 0) {
        throw new GeometryError("The selector must keep at least one edge");
    }
    return [...edges];
}

/** Every arc (or the selected ones) satisfying the given tangency, radius or centre constraints. */
export class ConstrainedArcs extends BaseCurveObject {
    constructor(targets: readonly TangencyTarget[], options: ConstrainedArcsObjectOptions = {}) {
        super(selected(makeConstrainedArcs(targets, options), options.selector));
    }
}

/** Every line (or the selected ones) tangent to the given curves, point or reference axis. */
export class ConstrainedLines extends BaseCurveObject {
    constructor(
        first: TangencyTarget,
        second: TangencyTarget | Axis,
        options: ConstrainedLinesObjectOptions = {},
    ) {
        super(selected(makeConstrainedLines(first, second, options), options.selector));
    }
}
