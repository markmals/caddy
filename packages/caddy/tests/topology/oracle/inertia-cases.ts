import type { OracleCases } from "./support.ts";

import {
    expectClose,
    expectMatrixClose,
    expectNumbersClose,
} from "../../../../../reference/build123d/oracle.ts";
import { MASS_TOLERANCE } from "../../../../../reference/build123d/tolerances.ts";
import { Axis, Pos } from "../../../src/geometry/index.ts";
import { box } from "./shapes.ts";

export const inertiaCases: OracleCases = {
    "properties/inertia-box": expected => {
        let solid = box().moved(new Pos(1, 2, 3));
        expectMatrixClose(expected, "matrix", solid.matrixOfInertia, MASS_TOLERANCE);
        expectNumbersClose(expected, "static_moments", solid.staticMoments, MASS_TOLERANCE);
        expectMatrixClose(
            expected,
            "principal",
            solid.principalProperties.map(([axis, moment]) => [
                Math.abs(axis.x),
                Math.abs(axis.y),
                Math.abs(axis.z),
                moment,
            ]),
            MASS_TOLERANCE,
        );
        expectClose(expected, "radius_z", solid.radiusOfGyration(Axis.Z), MASS_TOLERANCE);
        expectClose(
            expected,
            "radius_offset",
            solid.radiusOfGyration(new Axis([4, 5, 0], [0, 1, 1])),
            MASS_TOLERANCE,
        );
    },
    "properties/inertia-rotated": expected => {
        let solid = box().rotate(Axis.Z, 30, { transform: true });
        expectMatrixClose(expected, "matrix", solid.matrixOfInertia, MASS_TOLERANCE);
        expectNumbersClose(expected, "static_moments", solid.staticMoments, MASS_TOLERANCE);
        expectNumbersClose(
            expected,
            "principal_moments",
            solid.principalProperties.map(([, moment]) => moment),
            MASS_TOLERANCE,
        );
    },
};
