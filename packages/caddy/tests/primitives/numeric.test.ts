import { describe, expect, test } from "vite-plus/test";

import { Vector } from "../../src/geometry/vector.ts";
import { clusterPoints, clusterUnitVectors } from "../../src/mesh/primitives/cluster.ts";
import { formatNumber } from "../../src/mesh/primitives/code.ts";
import {
    canonicalizeDirection,
    evenlySpacedSubset,
    fitPlaneToPoints,
    leastSquares,
} from "../../src/mesh/primitives/numeric.ts";

describe("number formatting", () => {
    /**
     * What `format(value, "0.6g")` prints in Python, which is what build123d writes into the
     * code it generates: six significant digits, no trailing zeros, a two-digit exponent, and
     * ties resolved on the double's exact binary value (`12.66025` is just under the half).
     */
    let SIX_DIGIT_G: readonly (readonly [number, string])[] = [
        [0, "0"],
        [-0, "-0"],
        [10, "10"],
        [-5, "-5"],
        [0.5, "0.5"],
        [12.66025, "12.6602"],
        [12.660254, "12.6603"],
        [-1.9282, "-1.9282"],
        [123456, "123456"],
        [1234567, "1.23457e+06"],
        [99999.95, "99999.9"],
        [0.0001, "0.0001"],
        [0.00001234567, "1.23457e-05"],
        [1e-7, "1e-07"],
        [-Math.PI, "-3.14159"],
        [2 / 3, "0.666667"],
        [1e21, "1e+21"],
    ];

    for (let [value, expected] of SIX_DIGIT_G) {
        test(`${value} is written as ${expected}`, () => {
            expect(formatNumber(value)).toBe(expected);
        });
    }
});

test("an evenly spaced subset breaks its ties the way Python's round does", () => {
    // Index 1 lands on 2.5, which rounds to the even 2 in Python and to 3 in JavaScript.
    expect(evenlySpacedSubset([0, 1, 2, 3, 4, 5], 3)).toEqual([0, 2, 5]);
    expect(evenlySpacedSubset([0, 1, 2], 5)).toEqual([0, 1, 2]);
    expect(evenlySpacedSubset([0, 1, 2], 1)).toEqual([0]);
    expect(evenlySpacedSubset([0, 1, 2], 0)).toEqual([]);
});

test("a plane fit recovers the plane its points lie in", () => {
    let points = [
        new Vector(1, 0, 3),
        new Vector(-1, 0, 3),
        new Vector(0, 2, 3),
        new Vector(0, -2, 3),
    ];
    let { origin, normal } = fitPlaneToPoints(points);
    expect(origin.toTuple()).toEqual([0, 0, 3]);
    expect(normal.sub(new Vector(0, 0, 1)).length).toBeLessThan(1e-12);
});

test("a canonical direction points along its largest positive component", () => {
    expect(canonicalizeDirection(new Vector(0, -2, 0)).toTuple()).toEqual([-0, 1, -0]);
    expect(canonicalizeDirection(new Vector(0, 2, 0)).toTuple()).toEqual([0, 1, 0]);
});

describe("least squares", () => {
    test("solves a full-rank system exactly", () => {
        // The sphere fit's own system: x² + y² + z² + ax + by + cz + d = 0 through four points
        // of the unit sphere about the origin, whose only solution is a = b = c = 0, d = -1.
        let points = [
            [1, 0, 0],
            [-1, 0, 0],
            [0, 1, 0],
            [0, 0, 1],
        ];
        let fit = leastSquares(
            points.map(([x, y, z]) => [x!, y!, z!, 1]),
            points.map(([x, y, z]) => -(x! * x! + y! * y! + z! * z!)),
            4,
        );
        expect(fit?.rank).toBe(4);
        for (let [index, expected] of [0, 0, 0, -1].entries()) {
            expect(fit?.solution[index]).toBeCloseTo(expected, 12);
        }
    });

    test("reports a deficient rank for collinear points", () => {
        let points = [0, 1, 2, 3, 4, 5].map(value => [value, value, value, 1]);
        let fit = leastSquares(
            points,
            points.map(([x]) => -3 * x! * x!),
            4,
        );
        expect(fit?.rank).toBeLessThan(4);
    });

    test("has nothing to say about an empty system", () => {
        expect(leastSquares([], [], 4)).toBeUndefined();
    });
});

describe("DBSCAN", () => {
    test("splits a chain from the point beyond its reach", () => {
        let masks = clusterPoints(
            [
                [0, 0],
                [0.5, 0],
                [1, 0],
                [1.5, 0],
                [5, 0],
            ],
            0.6,
            2,
        );
        expect(masks).toEqual([[true, true, true, true, false]]);
    });

    test("needs enough neighbours before anything is a cluster", () => {
        expect(
            clusterPoints(
                [
                    [0, 0],
                    [0.5, 0],
                    [5, 0],
                ],
                0.6,
                3,
            ),
        ).toEqual([]);
    });

    test("groups unit vectors by the angle between them", () => {
        let vectors = [
            new Vector(1, 0, 0),
            new Vector(1, 0.01, 0).normalized(),
            new Vector(0, 1, 0),
            new Vector(0, 1, 0.01).normalized(),
        ];
        expect(clusterUnitVectors(vectors, 0.03, 2)).toEqual([
            [true, true, false, false],
            [false, false, true, true],
        ]);
    });
});
