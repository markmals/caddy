/** Incremental 3D convex hull, the triangulation `ConvexPolyhedron` builds its faces from. */

import type { Vector } from "../geometry/index.ts";

import { GeometryError } from "../errors.ts";

export type Triangle = readonly [number, number, number];

/**
 * Outward-facing triangles of the convex hull of `points`, as indices into it. Points inside the
 * hull and duplicates simply never appear in the result.
 */
export function convexHull(points: readonly Vector[]): Triangle[] {
    let scale = extent(points);
    let epsilon = Math.max(scale, 1) * 1e-9;
    let hull = initialTetrahedron(points, epsilon);
    for (let index = 0; index < points.length; index += 1) {
        hull = absorb(hull, points, index, epsilon);
    }
    return hull;
}

function extent(points: readonly Vector[]): number {
    if (points.length === 0) throw new GeometryError("A convex hull needs points");
    let coordinates = points.map(point => point.toTuple());
    let spans = [0, 1, 2].map(
        axis =>
            Math.max(...coordinates.map(point => point[axis]!)) -
            Math.min(...coordinates.map(point => point[axis]!)),
    );
    return Math.hypot(...spans);
}

/** Four points that enclose a volume; without them the input has no hull. */
function initialTetrahedron(points: readonly Vector[], epsilon: number): Triangle[] {
    let first = 0;
    let second = farthest(points, point => point.sub(points[first]!).length);
    if (points[second]!.sub(points[first]!).length <= epsilon) {
        throw new GeometryError("A convex hull needs points that are not all the same");
    }
    let along = points[second]!.sub(points[first]!).normalized();
    let third = farthest(points, point => point.sub(points[first]!).cross(along).length);
    let normal = points[third]!.sub(points[first]!).cross(along);
    if (normal.length <= epsilon) {
        throw new GeometryError("A convex hull needs points that are not collinear");
    }
    let unit = normal.normalized();
    let fourth = farthest(points, point => Math.abs(point.sub(points[first]!).dot(unit)));
    if (Math.abs(points[fourth]!.sub(points[first]!).dot(unit)) <= epsilon) {
        throw new GeometryError("A convex hull needs points that are not coplanar");
    }
    let corners: Triangle[] = [
        [first, second, third],
        [first, third, fourth],
        [first, fourth, second],
        [second, fourth, third],
    ];
    let inside = points[first]!.add(points[second]!)
        .add(points[third]!)
        .add(points[fourth]!)
        .multiply(0.25);
    return corners.map(triangle => (sees(triangle, points, inside) ? flipped(triangle) : triangle));
}

function farthest(points: readonly Vector[], measure: (point: Vector) => number): number {
    let best = 0;
    let bestValue = -Infinity;
    for (let index = 0; index < points.length; index += 1) {
        let value = measure(points[index]!);
        if (value > bestValue) {
            best = index;
            bestValue = value;
        }
    }
    return best;
}

/** Replaces every triangle the new point can see with a cone back to the horizon. */
function absorb(
    hull: readonly Triangle[],
    points: readonly Vector[],
    index: number,
    epsilon: number,
): Triangle[] {
    let point = points[index]!;
    let visible = hull.filter(triangle => sees(triangle, points, point, epsilon));
    if (visible.length === 0) return [...hull];
    let kept = hull.filter(triangle => !visible.includes(triangle));
    for (let edge of horizon(visible)) {
        kept.push([edge[0], edge[1], index]);
    }
    return kept;
}

/** Edges of the visible patch that only one of its triangles owns. */
function horizon(visible: readonly Triangle[]): [number, number][] {
    let counts = new Map<string, [number, number]>();
    for (let [a, b, c] of visible) {
        for (let edge of [
            [a, b],
            [b, c],
            [c, a],
        ] as [number, number][]) {
            let twin = `${edge[1]},${edge[0]}`;
            if (counts.has(twin)) counts.delete(twin);
            else counts.set(`${edge[0]},${edge[1]}`, edge);
        }
    }
    return [...counts.values()];
}

function sees(triangle: Triangle, points: readonly Vector[], point: Vector, epsilon = 0): boolean {
    let [a, b, c] = triangle;
    let normal = points[b]!.sub(points[a]!).cross(points[c]!.sub(points[a]!));
    return point.sub(points[a]!).dot(normal) > epsilon * normal.length;
}

function flipped(triangle: Triangle): Triangle {
    return [triangle[0], triangle[2], triangle[1]];
}
