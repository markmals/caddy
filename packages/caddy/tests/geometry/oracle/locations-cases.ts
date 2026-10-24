import type { OracleCases } from "./support.ts";

import { expectClose, expectVectorClose } from "../../../../../reference/build123d/oracle.ts";
import { EXACT_TOLERANCE } from "../../../../../reference/build123d/tolerances.ts";
import {
    Align,
    Axis,
    GridLocations,
    HexLocations,
    Location,
    Locations,
    Plane,
    PolarLocations,
    Pos,
    Vector,
} from "../../../src/index.ts";
import { expectLocationList } from "./support.ts";

/** `Locations` and the grid, hex and polar arrays built on it. */
export const locationsCases: OracleCases = {
    "locations/points": expected => {
        expectLocationList(
            expected,
            "mixed",
            new Locations(
                [1, 2],
                [3, 4, 5],
                new Vector(0, 0, 1),
                Location.fromOrientation([1, 1, 1], [0, 0, 45]),
                new Pos(2, 0, 0),
            ),
        );
        expectLocationList(
            expected,
            "frames",
            new Locations(Plane.YZ, Axis.Z, new Axis([1, 2, 3], [0, 1, 0])),
        );
        expectLocationList(
            expected,
            "nested",
            new Locations(
                [
                    [1, 0],
                    [2, 0],
                ],
                [[3, 0]],
            ),
        );
        expectLocationList(expected, "empty", new Locations());
        expectLocationList(expected, "empty_group", new Locations([]));
    },

    "locations/grid": expected => {
        let grid = new GridLocations(10, 20, 3, 2);
        expectLocationList(expected, "centered", grid);
        expectVectorClose(expected, "size", grid.size.toTuple(), EXACT_TOLERANCE);
        expectVectorClose(expected, "min", grid.min.toTuple(), EXACT_TOLERANCE);
        expectVectorClose(expected, "max", grid.max.toTuple(), EXACT_TOLERANCE);
        expectLocationList(expected, "single", new GridLocations(10, 20, 1, 1));
        expectLocationList(expected, "row", new GridLocations(5, 5, 4, 1));
    },

    "locations/grid-align": expected => {
        expectLocationList(expected, "min", new GridLocations(10, 20, 3, 2, { align: Align.Min }));
        expectLocationList(expected, "max", new GridLocations(10, 20, 3, 2, { align: Align.Max }));
        expectLocationList(
            expected,
            "mixed",
            new GridLocations(10, 20, 3, 2, { align: [Align.Min, Align.Max] }),
        );
        expectLocationList(
            expected,
            "none",
            new GridLocations(10, 20, 3, 2, { align: Align.None }),
        );
    },

    "locations/hex": expected => {
        let hexagons = new HexLocations(5, 3, 4);
        expectLocationList(expected, "minor_radius", hexagons);
        expectClose(expected, "apothem", hexagons.apothem, EXACT_TOLERANCE);
        expectClose(expected, "diagonal", hexagons.diagonal, EXACT_TOLERANCE);
        expectLocationList(expected, "single", new HexLocations(5, 1, 1));
        expectLocationList(
            expected,
            "aligned_min",
            new HexLocations(5, 3, 4, { align: Align.Min }),
        );
    },

    "locations/hex-major": expected => {
        let hexagons = new HexLocations(5, 2, 3, { majorRadius: true });
        expectLocationList(expected, "major_radius", hexagons);
        expectClose(expected, "apothem", hexagons.apothem, EXACT_TOLERANCE);
        expectClose(expected, "diagonal", hexagons.diagonal, EXACT_TOLERANCE);
        expectLocationList(expected, "wide", new HexLocations(2, 4, 2, { majorRadius: true }));
    },

    "locations/polar": expected => {
        expectLocationList(expected, "quarters", new PolarLocations(10, 4));
        expectLocationList(expected, "single", new PolarLocations(10, 1));
        expectLocationList(expected, "no_rotate", new PolarLocations(10, 4, { rotate: false }));
        expectLocationList(
            expected,
            "arc",
            new PolarLocations(10, 3, { startAngle: 30, angularRange: 120 }),
        );
    },

    "locations/polar-options": expected => {
        expectLocationList(
            expected,
            "endpoint",
            new PolarLocations(10, 4, { angularRange: 90, endpoint: true }),
        );
        expectLocationList(expected, "open", new PolarLocations(10, 4, { angularRange: 90 }));
        expectLocationList(
            expected,
            "negative_range",
            new PolarLocations(4, 3, { startAngle: 45, angularRange: -90 }),
        );
        expectLocationList(
            expected,
            "single_endpoint",
            new PolarLocations(10, 1, { startAngle: 15, angularRange: 90, endpoint: true }),
        );
    },
};
