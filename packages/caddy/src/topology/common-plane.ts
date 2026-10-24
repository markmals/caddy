import type { Edge } from "./edge.ts";
import type { Mixin1D } from "./mixin1d.ts";

import { Axis } from "../geometry/axis.ts";
import { Plane } from "../geometry/plane.ts";
import { Vector } from "../geometry/vector.ts";
import { GeomType } from "./enums.ts";

/** Samples taken along a curved line; a straight one needs only its ends. */
const CURVE_SAMPLES = 8;
/** Lines longer than this come from an axis and are shortened before sampling. */
const INFINITE_LENGTH = 1e50;

/**
 * The plane containing every one of `lines`, or `undefined` when they do not share one
 * (build123d `Mixin1D.common_plane`). Coaxial lines lie in infinitely many planes; one of them
 * is chosen, as build123d does.
 */
export function commonPlane(lines: readonly Mixin1D[], tolerance: number): Plane | undefined {
    if (lines.length === 0) return undefined;
    let coaxial = coaxialPlane(lines);
    let sampled = lines.map(shortened);
    let plane = coaxial ?? fittedPlane(sampled, tolerance);
    if (plane === undefined) return undefined;

    let center = sampled
        .reduce((sum, line) => sum.add(line.positionAt(0.5)), new Vector())
        .divide(sampled.length);
    return plane.shiftOrigin(new Axis(center, plane.zDir));
}

/** One of the infinitely many planes through lines that all share a single axis. */
function coaxialPlane(lines: readonly Mixin1D[]): Plane | undefined {
    let edges = lines.flatMap(line => [...line.edges]);
    if (edges.length === 0 || !edges.every(edge => edge.geomType === GeomType.Line)) {
        return undefined;
    }
    let axes = edges.map(edge => new Axis(edge.positionAt(0), edge.tangentAt(0)));
    let [first] = axes as [Axis, ...Axis[]];
    if (!axes.every(axis => first.isCoaxial(axis))) return undefined;
    return new Plane({ origin: first.position, zDir: Plane.fromAxis(first).xDir });
}

/** build123d shortens the unbounded edges an axis converts to before sampling them. */
function shortened(line: Mixin1D): Mixin1D {
    if (line.length <= INFINITE_LENGTH || line.shapeType !== "Edge") return line;
    return (line as Edge).trimToLength(0.5, 10);
}

/**
 * The plane through the three sampled points spanning the largest triangle, kept only when
 * every other sample lies on it. When several triples tie on area - crossing lines sample four
 * points that all do - the triple picked decides which way the normal points; build123d
 * resolves that tie through Python's set ordering, so the two can disagree on the normal's
 * sign. The plane itself is the same either way.
 */
function fittedPlane(lines: readonly Mixin1D[], tolerance: number): Plane | undefined {
    let points = uniquePoints(lines);
    let widest = widestTriangle(points);
    if (widest === undefined) return undefined;

    let [first, second, third] = widest;
    let xDir = second.sub(first).normalized();
    let zDir = third.sub(first).cross(xDir);
    if (zDir.length <= tolerance) return undefined;

    let origin = first.add(second).add(third).divide(3);
    let plane = new Plane({ origin, zDir });
    return points.every(point => plane.contains(point, tolerance)) ? plane : undefined;
}

function uniquePoints(lines: readonly Mixin1D[]): Vector[] {
    let points: Vector[] = [];
    for (let line of lines) {
        let count = line.geomType === GeomType.Line ? 2 : CURVE_SAMPLES;
        for (let sample = 0; sample < count; sample++) {
            let point = line.positionAt(sample / (count - 1));
            if (!points.some(seen => seen.equals(point))) points.push(point);
        }
    }
    return points;
}

function widestTriangle(points: readonly Vector[]): [Vector, Vector, Vector] | undefined {
    let widest: [Vector, Vector, Vector] | undefined;
    let largest = 0;
    for (let i = 0; i < points.length; i++) {
        for (let j = i + 1; j < points.length; j++) {
            for (let k = j + 1; k < points.length; k++) {
                let [first, second, third] = [points[i]!, points[j]!, points[k]!];
                let area = second.sub(first).cross(third.sub(first)).length / 2;
                if (area > largest) {
                    largest = area;
                    widest = [first, second, third];
                }
            }
        }
    }
    return widest;
}
