import type { FixtureCase } from "../../../../../reference/build123d/oracle.ts";
import type { OracleCases } from "../oracle/support.ts";
import type { GordonCurves } from "./shapes.ts";

import {
    expectMatrixClose,
    expectVectorClose,
    fixtureMatrix,
} from "../../../../../reference/build123d/oracle.ts";
import { APPROXIMATION_TOLERANCE } from "../../../../../reference/build123d/tolerances.ts";
import { Face } from "../../../src/topology/index.ts";
import { expectShapeMetrics } from "../oracle/support.ts";
import {
    arcNetwork,
    bezierNetwork,
    closedEllipseNetwork,
    GORDON_TOLERANCE,
    planarQuadNetwork,
    pointCurvePointNetwork,
    sinusoidalNetwork,
} from "./shapes.ts";

/** The parameter samples `reference/build123d/cases/gordon.py` records, in its row-major order. */
const GRID = [0, 0.25, 0.5, 0.75, 1];

export const networkCases: OracleCases = {
    "network/sinusoidal": expected => {
        let { profiles, guides } = sinusoidalNetwork();
        // No options object: the fixtures were generated with build123d's default tolerance, so
        // this case pins Caddy's default to the same 3e-4.
        expectSurface(expected, Face.makeGordonSurface(profiles, guides));
    },
    "network/planar-quad": expected => {
        let { profiles, guides } = planarQuadNetwork();
        expectSurface(expected, gordonSurface(profiles, guides));
    },
    "network/arc-profiles": expected => {
        let { profiles, guides } = arcNetwork();
        expectSurface(expected, gordonSurface(profiles, guides));
    },
    "network/bezier-profiles": expected => {
        let { profiles, guides } = bezierNetwork();
        expectSurface(expected, gordonSurface(profiles, guides));
    },
    "network/closed-ellipse-profiles": expected => {
        let { profiles, guides } = closedEllipseNetwork();
        expectSurface(expected, gordonSurface(profiles, guides));
    },
    "network/point-curve-point": expected => {
        let { profiles, guides } = pointCurvePointNetwork();
        expectSurface(expected, gordonSurface(profiles, guides));
    },
};

function gordonSurface(profiles: GordonCurves, guides: GordonCurves): Face {
    return Face.makeGordonSurface(profiles, guides, { tolerance: GORDON_TOLERANCE });
}

/**
 * The whole `_record` serializer. A Gordon surface is a B-spline approximation of the network,
 * so every value read off its surface is fitted geometry and is compared at OCCT's approximation
 * precision rather than at `Precision::Confusion`.
 */
function expectSurface(expected: FixtureCase, surface: Face): void {
    expectShapeMetrics(expected, "shape", surface);
    expectMatrixClose(
        expected,
        "grid",
        GRID.flatMap(u => GRID.map(v => surface.positionAt(u, v).toTuple())),
        APPROXIMATION_TOLERANCE,
    );
    expectVectorClose(expected, "normal_at", surface.normalAt().toTuple(), APPROXIMATION_TOLERANCE);
    expectVectorClose(expected, "center", surface.center.toTuple(), APPROXIMATION_TOLERANCE);
    expectAnchors(expected, surface);
}

/**
 * build123d's own assertion: the surface passes through the network curves, to within the
 * tolerance it was built with.
 */
function expectAnchors(expected: FixtureCase, surface: Face): void {
    let parameters = fixtureMatrix(expected, "anchor_parameters");
    expectMatrixClose(
        expected,
        "anchor_points",
        parameters.map(row => surface.positionAt(row[0]!, row[1]!).toTuple()),
        GORDON_TOLERANCE,
    );
}
