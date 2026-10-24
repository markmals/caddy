/**
 * Voronoi vertices of a planar point cloud, computed as the circumcentres of its Delaunay
 * triangulation. build123d reads them from SciPy (`scipy.spatial.Voronoi(points).vertices`) to get
 * candidate centres for the largest empty circle of `full_round`.
 *
 * SciPy wraps Qhull, which builds the triangulation as a hull in the lifted paraboloid and merges
 * facets it cannot separate reliably: degenerate (collinear) triples never become a facet, and
 * cocircular facets collapse onto one vertex. Both are reproduced here, so the vertex set agrees
 * with Qhull's up to the floating-point error of the circumcentres themselves.
 */

import { Vector } from "../../geometry/vector.ts";

/** Relative bound below which a determinant of float64 coordinates has an unreliable sign. */
const SIGN_EPSILON = 4e-16;

/** Coincident circumcentres merge at this fraction of the cloud's extent. */
const MERGE_FRACTION = 1e-9;

type Point = readonly [x: number, y: number];
type Corners = readonly [number, number, number];

/**
 * The Voronoi vertices of `points`, read as 2D points in the XY plane. Fewer than three distinct
 * points bound no cell and have no vertices.
 */
export function voronoiVertices(points: readonly Vector[]): Vector[] {
    let cloud = distinctPoints(points);
    if (cloud.length < 3) return [];
    let extent = Math.max(...cloud.map(([x, y]) => Math.abs(x) + Math.abs(y)), 1);
    let centers = triangulate(cloud).map(corners => circumcenter(cloud, corners));
    return mergeCoincident(centers, extent * MERGE_FRACTION);
}

/** Qhull merges coincident input points; duplicates would also degenerate the triangulation. */
function distinctPoints(points: readonly Vector[]): Point[] {
    let distinct: Point[] = [];
    let seen = new Set<string>();
    for (let point of points) {
        let key = `${point.x},${point.y}`;
        if (seen.has(key)) continue;
        seen.add(key);
        distinct.push([point.x, point.y]);
    }
    return distinct;
}

/**
 * Bowyer-Watson insertion into a triangle large enough to hold the cloud: each point in turn
 * replaces the triangles whose circumcircle it falls inside with a fan filling the hole they leave.
 */
function triangulate(cloud: readonly Point[]): Corners[] {
    let padded = [...cloud, ...enclosingTriangle(cloud)];
    let outer = cloud.length;
    let triangles: Corners[] = [[outer, outer + 1, outer + 2]];

    for (let index = 0; index < cloud.length; index++) {
        let kept: Corners[] = [];
        let hole: [number, number][] = [];
        for (let corners of triangles) {
            if (insideCircumcircle(padded, corners, index)) {
                let [a, b, c] = corners;
                hole.push([a, b], [b, c], [c, a]);
            } else {
                kept.push(corners);
            }
        }
        triangles = kept;
        for (let [from, to] of boundaryOf(hole)) {
            let fanned = orientedTriangle(padded, from, to, index);
            if (fanned !== undefined) triangles.push(fanned);
        }
    }

    return triangles.filter(corners => corners.every(corner => corner < outer));
}

/** A triangle whose circumcircle contains every point of the cloud with room to spare. */
function enclosingTriangle(cloud: readonly Point[]): Point[] {
    let xs = cloud.map(([x]) => x);
    let ys = cloud.map(([, y]) => y);
    let [left, right] = [Math.min(...xs), Math.max(...xs)];
    let [bottom, top] = [Math.min(...ys), Math.max(...ys)];
    let reach = 1000 * Math.max(right - left, top - bottom);
    let centerX = (left + right) / 2;
    return [
        [centerX - 2 * reach, bottom - reach],
        [centerX + 2 * reach, bottom - reach],
        [centerX, bottom + 2 * reach],
    ];
}

/**
 * The corners counterclockwise, or `undefined` when they are collinear within the precision of
 * float64 coordinates: a zero-area triangle has no circumcircle to test points against, and Qhull
 * never makes one a facet.
 */
function orientedTriangle(
    points: readonly Point[],
    a: number,
    b: number,
    c: number,
): Corners | undefined {
    let [ax, ay] = points[a] as Point;
    let [bx, by] = points[b] as Point;
    let [cx, cy] = points[c] as Point;
    let [left, right] = [(bx - ax) * (cy - ay), (by - ay) * (cx - ax)];
    let area = left - right;
    if (Math.abs(area) <= SIGN_EPSILON * (Math.abs(left) + Math.abs(right))) return undefined;
    return area > 0 ? [a, b, c] : [a, c, b];
}

/**
 * Whether the point sits inside the circumcircle of a counterclockwise triangle, as the sign of
 * the lifted determinant rather than a distance to a computed centre, which slivers blow up.
 */
function insideCircumcircle(points: readonly Point[], corners: Corners, index: number): boolean {
    let [px, py] = points[index] as Point;
    let [ax, ay] = points[corners[0]] as Point;
    let [bx, by] = points[corners[1]] as Point;
    let [cx, cy] = points[corners[2]] as Point;
    let [adx, ady] = [ax - px, ay - py];
    let [bdx, bdy] = [bx - px, by - py];
    let [cdx, cdy] = [cx - px, cy - py];
    return (
        (adx * adx + ady * ady) * (bdx * cdy - cdx * bdy) -
            (bdx * bdx + bdy * bdy) * (adx * cdy - cdx * ady) +
            (cdx * cdx + cdy * cdy) * (adx * bdy - bdx * ady) >
        0
    );
}

/** The edges of the hole: those bordering exactly one of the removed triangles. */
function boundaryOf(edges: readonly [number, number][]): [number, number][] {
    let shared = new Set<string>();
    let once = new Map<string, [number, number]>();
    for (let [from, to] of edges) {
        let key = from < to ? `${from},${to}` : `${to},${from}`;
        if (once.delete(key)) {
            shared.add(key);
        } else if (!shared.has(key)) {
            once.set(key, [from, to]);
        }
    }
    return [...once.values()];
}

/** Centre of the circle through the three corners, offset from the first to keep the precision. */
function circumcenter(points: readonly Point[], corners: Corners): Point {
    let [ax, ay] = points[corners[0]] as Point;
    let [bx, by] = points[corners[1]] as Point;
    let [cx, cy] = points[corners[2]] as Point;
    let [ux, uy] = [bx - ax, by - ay];
    let [vx, vy] = [cx - ax, cy - ay];
    let determinant = 2 * (ux * vy - uy * vx);
    let [uLength, vLength] = [ux * ux + uy * uy, vx * vx + vy * vy];
    return [
        ax + (vy * uLength - uy * vLength) / determinant,
        ay + (ux * vLength - vx * uLength) / determinant,
    ];
}

function mergeCoincident(centers: readonly Point[], tolerance: number): Vector[] {
    let vertices: Vector[] = [];
    for (let [x, y] of centers) {
        let merged = vertices.some(
            vertex => Math.abs(vertex.x - x) <= tolerance && Math.abs(vertex.y - y) <= tolerance,
        );
        if (!merged) vertices.push(new Vector(x, y));
    }
    return vertices;
}
