/**
 * The numerical kernel behind `detectPrimitives`.
 *
 * build123d's `brep_from_stl` leans on NumPy for three things: population statistics, the SVD
 * that fits a plane through a point cloud, and the rank-revealing least squares that fits a
 * sphere through four unknowns. All three are reproduced here in plain float64 arithmetic so
 * the detector stays deterministic and free of a linear-algebra dependency.
 *
 * Both decompositions are the same one-sided Jacobi sweep: rotate pairs of columns until they
 * are mutually orthogonal, at which point the column norms are the singular values, the
 * normalised columns are the left singular vectors, and the accumulated rotations are the right
 * ones. Jacobi never forms `AᵀA`, so it keeps the accuracy of a QR-based LAPACK driver on the
 * tall, three- and four-column matrices this module feeds it.
 */

import { roundTo } from "../../geometry/rounding.ts";
import { Vector } from "../../geometry/vector.ts";

/** The zero threshold `brep_from_stl` uses for lengths, areas and determinants. */
export const EPS = 1e-9;

/** Jacobi stops once no column pair is more than this far from orthogonal, relative to norm. */
const JACOBI_TOLERANCE = 1e-15;
/** A 3- or 4-column sweep converges in a handful of passes; the cap only guards pathologies. */
const MAX_JACOBI_SWEEPS = 60;

export function mean(values: readonly number[]): number {
    let total = 0;
    for (let value of values) total += value;
    return total / values.length;
}

export function median(values: readonly number[]): number {
    let ordered = [...values].sort((first, second) => first - second);
    let middle = Math.floor(ordered.length / 2);
    if (ordered.length % 2 === 1) return ordered[middle]!;
    return (ordered[middle - 1]! + ordered[middle]!) / 2;
}

/** Population standard deviation, matching NumPy's `std` default and build123d's own helper. */
export function standardDeviation(values: readonly number[]): number {
    let average = mean(values);
    let total = 0;
    for (let value of values) total += (value - average) ** 2;
    return Math.sqrt(total / values.length);
}

export function meanVector(vectors: readonly Vector[]): Vector {
    let total = new Vector();
    for (let vector of vectors) total = total.add(vector);
    return total.divide(vectors.length);
}

/** A deterministic evenly spaced subset, index-for-index with build123d's own. */
export function evenlySpacedSubset<T>(values: readonly T[], maxCount: number): T[] {
    if (maxCount <= 0) return [];
    if (values.length <= maxCount) return [...values];
    if (maxCount === 1) return [values[0]!];
    let lastIndex = values.length - 1;
    let subset: T[] = [];
    for (let i = 0; i < maxCount; i += 1) {
        // Python's `round` breaks ties to even, which lands on a different sample than
        // `Math.round` whenever the spacing puts an index exactly halfway.
        subset.push(values[roundTo((i * lastIndex) / (maxCount - 1), 0)]!);
    }
    return subset;
}

/** A unit vector, or an error for input too short to have a direction. */
export function normalized(vector: Vector): Vector {
    if (vector.length <= EPS) {
        throw new RangeError("Cannot normalize near-zero vector");
    }
    return vector.normalized();
}

/** Flip a direction so the component of largest magnitude is positive. */
export function canonicalizeDirection(direction: Vector): Vector {
    let unit = normalized(direction);
    let values = unit.toTuple();
    let maxIndex = 0;
    for (let index = 1; index < 3; index += 1) {
        if (Math.abs(values[index]!) > Math.abs(values[maxIndex]!)) maxIndex = index;
    }
    return values[maxIndex]! >= 0 ? unit : unit.multiply(-1);
}

/** The unsigned angle between two directions, each taken up to a sign flip. */
export function directionAngleDelta(first: Vector, second: Vector): number {
    let dot = Math.abs(canonicalizeDirection(first).dot(canonicalizeDirection(second)));
    return Math.acos(Math.min(1, Math.max(-1, dot)));
}

/** An orthonormal pair spanning the plane with this normal. */
export function planeBasis(normal: Vector): [Vector, Vector] {
    let helper = new Vector(1, 0, 0);
    if (Math.abs(helper.dot(normal)) > 0.9) helper = new Vector(0, 1, 0);
    let u = normalized(normal.cross(helper));
    return [u, normalized(normal.cross(u))];
}

export function planePointDistances(
    points: readonly Vector[],
    origin: Vector,
    normal: Vector,
): number[] {
    return points.map(point => Math.abs(point.sub(origin).dot(normal)));
}

/** The circumradius of three points, or `undefined` when they are collinear. */
export function circumradius(a: Vector, b: Vector, c: Vector): number | undefined {
    let sideA = b.sub(c).length;
    let sideB = a.sub(c).length;
    let sideC = a.sub(b).length;
    let twiceArea = b.sub(a).cross(c.sub(a)).length;
    if (twiceArea <= EPS) return undefined;
    return (sideA * sideB * sideC) / (2 * twiceArea);
}

/** The first non-collinear triplet, in the order `itertools.combinations` would reach it. */
export function pickNonCollinearTriplet(
    points: readonly Vector[],
): [Vector, Vector, Vector] | undefined {
    for (let first = 0; first < points.length; first += 1) {
        for (let second = first + 1; second < points.length; second += 1) {
            for (let third = second + 1; third < points.length; third += 1) {
                let a = points[first]!;
                let b = points[second]!;
                let c = points[third]!;
                if (b.sub(a).cross(c.sub(a)).length > EPS) return [a, b, c];
            }
        }
    }
    return undefined;
}

/** Intersect two 2D lines given as a point and a direction each. */
export function intersect2dLines(
    pointA: readonly [number, number],
    directionA: readonly [number, number],
    pointB: readonly [number, number],
    directionB: readonly [number, number],
): [number, number] | undefined {
    let determinant = directionB[0] * directionA[1] - directionA[0] * directionB[1];
    if (Math.abs(determinant) <= EPS) return undefined;
    let deltaX = pointB[0] - pointA[0];
    let deltaY = pointB[1] - pointA[1];
    let scale = (directionB[0] * deltaY - directionB[1] * deltaX) / determinant;
    return [pointA[0] + scale * directionA[0], pointA[1] + scale * directionA[1]];
}

/**
 * The plane of best fit through `points`: their centroid, and the right singular vector of the
 * smallest singular value of the centred coordinates, flipped to a canonical sign.
 */
export function fitPlaneToPoints(points: readonly Vector[]): { origin: Vector; normal: Vector } {
    if (points.length < 3) {
        throw new RangeError("Need at least three points to fit a plane");
    }
    let origin = meanVector(points);
    let rows = points.map(point => {
        let offset = point.sub(origin);
        return [offset.x, offset.y, offset.z];
    });
    let { singularValues, rightVectors } = jacobiSvd(rows, 3);
    let smallest = 0;
    for (let column = 1; column < 3; column += 1) {
        if (singularValues[column]! < singularValues[smallest]!) smallest = column;
    }
    let normal = new Vector(
        rightVectors[0]![smallest]!,
        rightVectors[1]![smallest]!,
        rightVectors[2]![smallest]!,
    );
    return { origin, normal: canonicalizeDirection(normal) };
}

/**
 * The minimum-norm least squares solution of `rows · x = rhs`, with the numerical rank NumPy's
 * `lstsq(..., rcond=None)` would report. `undefined` when the system has no rows to fit.
 */
export function leastSquares(
    rows: readonly (readonly number[])[],
    rhs: readonly number[],
    columnCount: number,
): { solution: number[]; rank: number } | undefined {
    if (rows.length === 0) return undefined;
    let { singularValues, rightVectors, columns } = jacobiSvd(rows, columnCount);
    let largest = Math.max(...singularValues);
    // NumPy's `rcond=None`: singular values below `eps * max(rows, columns)` of the largest are
    // treated as zero, both for the rank and for the pseudo-inverse.
    let cutoff = Number.EPSILON * Math.max(rows.length, columnCount) * largest;
    let solution: number[] = Array.from({ length: columnCount }, () => 0);
    let rank = 0;
    for (let column = 0; column < columnCount; column += 1) {
        let sigma = singularValues[column]!;
        if (sigma <= cutoff) continue;
        rank += 1;
        let projection = 0;
        for (let row = 0; row < rows.length; row += 1) {
            projection += columns[row]![column]! * rhs[row]!;
        }
        let weight = projection / (sigma * sigma);
        for (let index = 0; index < columnCount; index += 1) {
            solution[index]! += weight * rightVectors[index]![column]!;
        }
    }
    return { solution, rank };
}

/**
 * One-sided Jacobi SVD of a tall matrix.
 *
 * `columns` is the input with its columns rotated until they are mutually orthogonal, so each
 * column is the matching left singular vector scaled by its singular value; `rightVectors` holds
 * the accumulated rotations, one right singular vector per column.
 */
function jacobiSvd(
    rows: readonly (readonly number[])[],
    columnCount: number,
): {
    singularValues: number[];
    rightVectors: number[][];
    columns: number[][];
} {
    let work = rows.map(row => row.slice(0, columnCount));
    let rightVectors: number[][] = [];
    for (let row = 0; row < columnCount; row += 1) {
        rightVectors.push(
            Array.from({ length: columnCount }, (_unused, column) => (row === column ? 1 : 0)),
        );
    }

    for (let sweep = 0; sweep < MAX_JACOBI_SWEEPS; sweep += 1) {
        let rotated = false;
        for (let p = 0; p < columnCount - 1; p += 1) {
            for (let q = p + 1; q < columnCount; q += 1) {
                let alpha = 0;
                let beta = 0;
                let gamma = 0;
                for (let row of work) {
                    alpha += row[p]! * row[p]!;
                    beta += row[q]! * row[q]!;
                    gamma += row[p]! * row[q]!;
                }
                if (Math.abs(gamma) <= JACOBI_TOLERANCE * Math.sqrt(alpha * beta)) continue;
                rotated = true;
                // The rotation that zeroes the pair's inner product, written in the stable
                // `tan`-of-the-half-angle form rather than through an arctangent.
                let zeta = (beta - alpha) / (2 * gamma);
                let tangent = Math.sign(zeta || 1) / (Math.abs(zeta) + Math.sqrt(1 + zeta * zeta));
                let cosine = 1 / Math.sqrt(1 + tangent * tangent);
                let sine = cosine * tangent;
                for (let row of work) {
                    let valueP = row[p]!;
                    let valueQ = row[q]!;
                    row[p] = cosine * valueP - sine * valueQ;
                    row[q] = sine * valueP + cosine * valueQ;
                }
                for (let row of rightVectors) {
                    let valueP = row[p]!;
                    let valueQ = row[q]!;
                    row[p] = cosine * valueP - sine * valueQ;
                    row[q] = sine * valueP + cosine * valueQ;
                }
            }
        }
        if (!rotated) break;
    }

    let singularValues: number[] = [];
    for (let column = 0; column < columnCount; column += 1) {
        let total = 0;
        for (let row of work) total += row[column]! * row[column]!;
        singularValues.push(Math.sqrt(total));
    }
    return { singularValues, rightVectors, columns: work };
}
