import type { OracleCases } from "./support.ts";

import { Axis, Location, Plane } from "../../../src/geometry/index.ts";
import { box, cylinder } from "./shapes.ts";
import { expectNames, expectPlaced } from "./support.ts";

export const transformCases: OracleCases = {
    "transform/moved": expected => {
        expectPlaced(expected, box().moved(Location.fromOrientation([1, 2, 3], [0, 0, 30])));
    },
    "transform/moved-twice": expected => {
        let once = box().moved(Location.fromPosition([1, 2, 3]));
        expectPlaced(expected, once.moved(Location.fromOrientation([0, 0, 5], [0, 45, 0])));
    },
    "transform/located": expected => {
        let once = box().moved(Location.fromPosition([1, 2, 3]));
        expectPlaced(expected, once.located(Location.fromOrientation([0, 0, 5], [0, 45, 0])));
    },
    "transform/translate": expected => {
        expectPlaced(expected, box().translate([3, -2, 1]));
    },
    "transform/translate-geometry": expected => {
        expectPlaced(expected, box().translate([3, -2, 1], true));
    },
    "transform/rotate": expected => {
        expectPlaced(expected, box().rotate(Axis.Z, 35));
    },
    "transform/rotate-geometry": expected => {
        expectPlaced(expected, box().rotate(new Axis([1, 1, 0], [0, 1, 1]), 35, true));
    },
    "transform/scale-uniform": expected => {
        expectPlaced(expected, box().scale(2));
    },
    "transform/scale-about": expected => {
        expectPlaced(expected, box().scale(0.5, [10, 6, 4]));
    },
    "transform/scale-nonuniform": expected => {
        let scaled = cylinder().scale([2, 1, 0.5]);
        expectPlaced(expected, scaled);
        expectNames(
            expected,
            "face_geom_types",
            scaled
                .faces()
                .map(face => face.geomType)
                .sort(),
        );
    },
    "transform/mirror": expected => {
        expectPlaced(expected, box().mirror(Plane.YZ));
    },
    "transform/mirror-default": expected => {
        expectPlaced(expected, box().mirror());
    },
    "transform/transformed": expected => {
        expectPlaced(expected, box().transformed([10, 20, 30], [1, 2, 3]));
    },
    "transform/transform-shape": expected => {
        let placement = Location.fromOrientation([2, 0, 0], [0, 0, 90]);
        expectPlaced(expected, box().transformShape(placement.transform));
    },
    "transform/transform-geometry": expected => {
        let sheared = box().transformGeometry([
            [1, 0.5, 0, 0],
            [0, 1, 0, 0],
            [0, 0, 1, 0],
        ]);
        expectPlaced(expected, sheared);
        expectNames(
            expected,
            "face_geom_types",
            sheared
                .faces()
                .map(face => face.geomType)
                .sort(),
        );
    },
};
