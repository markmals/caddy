/**
 * DBSCAN, the one piece of scikit-learn `brep_from_stl` depends on.
 *
 * The detector clusters two things: candidate cylinder axes, as unit vectors under cosine
 * distance, and candidate axis positions, as 2D points under Euclidean distance. Both calls
 * only ever ask for the largest cluster, but the labelling is reproduced exactly as
 * `sklearn.cluster.DBSCAN` computes it — neighbourhoods include the point itself, a point is
 * core when its neighbourhood reaches `minSamples`, and clusters grow by the depth-first walk
 * of `sklearn`'s `dbscan_inner`, so a border point joins whichever core region reaches it first.
 *
 * Neighbour lists are built by brute force in ascending index order. scikit-learn's spatial
 * trees may enumerate a neighbourhood in another order, which can only matter for a border
 * point that two separate core regions both reach; the detector's thresholds keep its clusters
 * further apart than that.
 */

import type { Vector } from "../../geometry/vector.ts";

/** One boolean per input, true where the input belongs to the cluster. */
export type ClusterMask = boolean[];

/** Cluster points under Euclidean distance; one mask per cluster, noise excluded. */
export function clusterPoints(
    points: readonly (readonly number[])[],
    eps: number,
    minSamples: number,
): ClusterMask[] {
    if (points.length < minSamples) return [];
    return dbscan(
        points.length,
        minSamples,
        (first, second) => euclideanDistance(points[first]!, points[second]!) <= eps,
    );
}

/** Cluster unit vectors under cosine distance; one mask per cluster, noise excluded. */
export function clusterUnitVectors(
    vectors: readonly Vector[],
    eps: number,
    minSamples: number,
): ClusterMask[] {
    if (vectors.length < minSamples) return [];
    return dbscan(
        vectors.length,
        minSamples,
        (first, second) => cosineDistance(vectors[first]!, vectors[second]!) <= eps,
    );
}

function euclideanDistance(first: readonly number[], second: readonly number[]): number {
    let total = 0;
    for (let axis = 0; axis < first.length; axis += 1) {
        total += (first[axis]! - second[axis]!) ** 2;
    }
    return Math.sqrt(total);
}

/** `1 - cos(angle)`, clipped to `[0, 2]` the way scikit-learn's `cosine_distances` clips it. */
function cosineDistance(first: Vector, second: Vector): number {
    let scale = first.length * second.length;
    if (scale === 0) return 1;
    return Math.min(2, Math.max(0, 1 - first.dot(second) / scale));
}

function dbscan(
    count: number,
    minSamples: number,
    within: (first: number, second: number) => boolean,
): ClusterMask[] {
    let neighbourhoods: number[][] = [];
    for (let index = 0; index < count; index += 1) neighbourhoods.push([]);
    for (let first = 0; first < count; first += 1) {
        neighbourhoods[first]!.push(first);
        for (let second = first + 1; second < count; second += 1) {
            if (!within(first, second)) continue;
            neighbourhoods[first]!.push(second);
            neighbourhoods[second]!.push(first);
        }
    }
    // Brute force fills the lower half out of order; sorting restores ascending index order.
    for (let neighbours of neighbourhoods) neighbours.sort((a, b) => a - b);

    let isCore = neighbourhoods.map(neighbours => neighbours.length >= minSamples);
    let labels: number[] = Array.from({ length: count }, () => -1);
    let clusterCount = 0;
    let stack: number[] = [];
    for (let seed = 0; seed < count; seed += 1) {
        if (labels[seed] !== -1 || !isCore[seed]) continue;
        let index = seed;
        for (;;) {
            if (labels[index] === -1) {
                labels[index] = clusterCount;
                if (isCore[index]) {
                    for (let neighbour of neighbourhoods[index]!) {
                        if (labels[neighbour] === -1) stack.push(neighbour);
                    }
                }
            }
            let next = stack.pop();
            if (next === undefined) break;
            index = next;
        }
        clusterCount += 1;
    }

    let masks: ClusterMask[] = [];
    for (let cluster = 0; cluster < clusterCount; cluster += 1) {
        masks.push(labels.map(label => label === cluster));
    }
    return masks;
}

/** The mask covering the most inputs, preferring the earliest on a tie as `max` does. */
export function largestCluster(masks: readonly ClusterMask[]): ClusterMask | undefined {
    let best: ClusterMask | undefined;
    let bestCount = -1;
    for (let mask of masks) {
        let count = mask.reduce((total, flag) => total + (flag ? 1 : 0), 0);
        if (count > bestCount) {
            best = mask;
            bestCount = count;
        }
    }
    return best;
}
