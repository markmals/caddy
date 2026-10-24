/** The networks `reference/build123d/cases/gordon.py` builds, rebuilt through Caddy's makers. */

import type { VectorLike } from "../../../src/geometry/index.ts";

import { Vector } from "../../../src/geometry/index.ts";
import { Edge } from "../../../src/topology/index.ts";

/** build123d's default, and the tolerance every fixture case in the suite was generated with. */
export const GORDON_TOLERANCE = 3e-4;

/** A profile or guide list: curves, with a point allowed at either end. */
export type GordonCurves = Array<Edge | VectorLike>;

/** The four corner points build123d's input-type tests build every network from. */
export function quadPoints(): [Vector, Vector, Vector, Vector] {
    return [
        new Vector(0, 0, 0),
        new Vector(10, 0, 0),
        new Vector(12, 20, 1),
        new Vector(4, 22, -1),
    ];
}

/** build123d's `create_test_curves`: splines through a sinusoidal grid of intersections. */
export function sinusoidalNetwork(): { profiles: Edge[]; guides: Edge[] } {
    let profileCount = 3;
    let guideCount = 4;
    let intersections = Array.from({ length: profileCount }, (_, i) =>
        Array.from({ length: guideCount }, (_, j): VectorLike => {
            let u = i / (profileCount - 1);
            let v = j / (guideCount - 1);
            return [u, v, 0.2 * Math.sin(u * Math.PI) * Math.cos(v * Math.PI)];
        }),
    );
    return {
        profiles: intersections.map(row => Edge.makeSpline(row)),
        guides: Array.from({ length: guideCount }, (_, j) =>
            Edge.makeSpline(intersections.map(row => row[j]!)),
        ),
    };
}

/** Four lines closing a skew quad. */
export function planarQuadNetwork(): { profiles: Edge[]; guides: Edge[] } {
    let points = quadPoints();
    return {
        profiles: [Edge.makeLine(points[0], points[1]), Edge.makeLine(points[3], points[2])],
        guides: [Edge.makeLine(points[0], points[3]), Edge.makeLine(points[1], points[2])],
    };
}

/** Two arched profiles joined by straight guides. */
export function arcNetwork(): { profiles: Edge[]; guides: Edge[] } {
    let points = quadPoints();
    let profiles = [
        Edge.makeThreePointArc(
            points[0],
            points[0].add(points[1]).divide(2).add([0, 0, 2]),
            points[1],
        ),
        Edge.makeThreePointArc(
            points[3],
            points[3].add(points[2]).divide(2).add([0, 0, 3]),
            points[2],
        ),
    ];
    return { profiles, guides: endGuides(profiles) };
}

/** Two cubic Bézier profiles joined by straight guides. */
export function bezierNetwork(): { profiles: Edge[]; guides: Edge[] } {
    let points = quadPoints();
    let profiles = [
        Edge.makeBezier([points[0], points[0].add([1, 0, 1]), points[1].sub([1, 0, 1]), points[1]]),
        Edge.makeBezier([points[3], points[3].add([1, 0, 1]), points[2].sub([1, 0, 1]), points[2]]),
    ];
    return { profiles, guides: endGuides(profiles) };
}

/** Two closed ellipses ten units apart, with both guides running from the first one's seam. */
export function closedEllipseNetwork(): { profiles: Edge[]; guides: Edge[] } {
    let profiles = [Edge.makeEllipse(10, 6), Edge.makeEllipse(8, 7).translate([1, 2, 10])];
    return {
        profiles,
        guides: [
            Edge.makeLine(profiles[0]!.positionAt(0), profiles[1]!.positionAt(0)),
            Edge.makeLine(profiles[0]!.positionAt(0.5), profiles[1]!.positionAt(0.5)),
        ],
    };
}

/** A profile list that starts and ends with a point, with an arc between them. */
export function pointCurvePointNetwork(): { profiles: GordonCurves; guides: Edge[] } {
    let points = quadPoints();
    let arc = Edge.makeThreePointArc(
        points[1],
        points[1].add(points[3]).divide(2).add([0, 0, 2]),
        points[3],
    );
    return {
        profiles: [points[0], arc, points[2]],
        guides: [
            Edge.makeSpline([points[0], arc.positionAt(0), points[2]]),
            Edge.makeSpline([points[0], arc.positionAt(1), points[2]]),
        ],
    };
}

/** A point in the middle of the profile list: only the first and last may be points. */
export function interiorPointNetwork(): { profiles: GordonCurves; guides: Edge[] } {
    let points = quadPoints();
    let midpoint = points[0].add(points[2]).divide(2);
    let first = Edge.makeLine(points[0], points[1]);
    let last = Edge.makeLine(points[3], points[2]);
    return {
        profiles: [first, midpoint, last],
        guides: [
            Edge.makeSpline([first.positionAt(0), midpoint, last.positionAt(0)]),
            Edge.makeSpline([first.positionAt(1), midpoint, last.positionAt(1)]),
        ],
    };
}

/** Straight guides joining the starts and the ends of two profiles. */
function endGuides(profiles: readonly Edge[]): Edge[] {
    return [0, 1].map(end =>
        Edge.makeLine(profiles[0]!.positionAt(end), profiles[1]!.positionAt(end)),
    );
}
