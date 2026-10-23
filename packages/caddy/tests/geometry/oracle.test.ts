/**
 * Differential tests for the geometry classes against the pinned build123d 0.13.0 oracle.
 *
 * Every fixture case in `reference/build123d/fixtures/geometry.json` must appear exactly once
 * in the map below; `oracleSuite` fails the run if a case or an implementation is unmatched.
 */

import type { FixtureCase } from "../../../../reference/build123d/oracle.ts";

import { oracleSuite } from "../../../../reference/build123d/oracle.ts";
import { Plane } from "../../src/index.ts";
import { axisCases } from "./oracle/axis-cases.ts";
import { boundingBoxCases } from "./oracle/bounding-box-cases.ts";
import { eulerCases } from "./oracle/euler-cases.ts";
import { locationCases } from "./oracle/location-cases.ts";
import { occtCases } from "./oracle/occt-cases.ts";
import { planeCases } from "./oracle/plane-cases.ts";
import { expectPlane, ORDERINGS } from "./oracle/support.ts";
import { vectorCases } from "./oracle/vector-cases.ts";

const NAMED_PLANES: Record<string, Plane> = {
    xy: Plane.XY,
    yz: Plane.YZ,
    zx: Plane.ZX,
    xz: Plane.XZ,
    yx: Plane.YX,
    zy: Plane.ZY,
    front: Plane.front,
    back: Plane.back,
    left: Plane.left,
    right: Plane.right,
    top: Plane.top,
    bottom: Plane.bottom,
    isometric: Plane.isometric,
};

oracleSuite("geometry", {
    ...eulerCases,
    ...vectorCases,
    ...axisCases,
    ...planeCases,
    ...locationCases,
    ...boundingBoxCases,
    ...occtCases,

    ...Object.fromEntries(
        Object.entries(NAMED_PLANES).map(([key, value]) => [
            `plane/named/${key}`,
            (expected: FixtureCase) => expectPlane(expected, "plane", value),
        ]),
    ),

    ...Object.fromEntries(
        Object.entries(ORDERINGS).map(([key, ordering]) => [
            `plane/rotated/${key}`,
            (expected: FixtureCase) =>
                expectPlane(expected, "plane", Plane.XY.rotated([15, 25, 35], ordering)),
        ]),
    ),
});
