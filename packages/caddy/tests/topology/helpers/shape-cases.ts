import { expect } from "vite-plus/test";

import type { OracleCases } from "../oracle/support.ts";

import {
    expectClose,
    expectNumbersClose,
    fixtureValue,
} from "../../../../../reference/build123d/oracle.ts";
import {
    APPROXIMATION_TOLERANCE,
    LINEAR_TOLERANCE,
    MASS_TOLERANCE,
} from "../../../../../reference/build123d/tolerances.ts";
import { Axis, Plane, Pos, Rot, Vector } from "../../../src/geometry/index.ts";
import { Box, Cylinder } from "../../../src/parts/index.ts";
import { Compound, Edge, Shape, topoDistanceTo } from "../../../src/topology/index.ts";
import { expectCount, expectName, expectPoint } from "../oracle/support.ts";
import { expectLocationClose, expectRows, makeBox, sortedCenters } from "./support.ts";

export const shapeCases: OracleCases = {
    "as-shape/point-and-location": expected => {
        let fromVector = Shape.asShape(new Vector(1, 2, 3));
        let fromLocation = Shape.asShape(new Pos(4, 5, 6));
        expectName(expected, "vector_type", fromVector.shapeType);
        expectPoint(expected, "vector_point", fromVector.center());
        expectName(expected, "location_type", fromLocation.shapeType);
        expectPoint(expected, "location_point", fromLocation.center());
    },

    "as-shape/axis-and-plane": expected => {
        let edge = Shape.asShape(new Axis([1, 2, 3], [0, 0, 1]));
        let face = Shape.asShape(new Plane({ origin: [0, 0, 5], zDir: [0, 0, 1] }));
        expectName(expected, "axis_type", edge.shapeType);
        expectName(expected, "axis_geom_type", edge.geomType);
        expectNumbersClose(
            expected,
            "axis_distances",
            [edge.distanceTo([1, 2, 3]), edge.distanceTo([1, 2, 500]), edge.distanceTo([4, 2, 3])],
            LINEAR_TOLERANCE,
        );
        expectName(expected, "plane_type", face.shapeType);
        expectName(expected, "plane_geom_type", face.geomType);
        expectNumbersClose(
            expected,
            "plane_distances",
            [face.distanceTo([7, -8, 5]), face.distanceTo([0, 0, 9])],
            LINEAR_TOLERANCE,
        );
    },

    "as-shape/shape-passes-through": expected => {
        let box = new Box(1, 1, 1);
        expect(Shape.asShape(box) === box, `${expected.name}.same`).toBe(
            fixtureValue(expected, "same"),
        );
    },

    "compute-volume/every-dimension": expected => {
        let box = new Box(2, 3, 4);
        let top = box.faces().sortBy(Axis.Z).at(-1)!;
        expectClose(expected, "vertex", box.vertices()[0]!.computeVolume(), MASS_TOLERANCE);
        expectClose(
            expected,
            "edge",
            box.edges().sortBy(Axis.Z)[0]!.computeVolume(),
            MASS_TOLERANCE,
        );
        expectClose(expected, "wire", top.outerWire().computeVolume(), MASS_TOLERANCE);
        expectClose(expected, "face", top.computeVolume(), MASS_TOLERANCE);
        expectClose(expected, "shell", makeBox(2, 3, 4).shell().computeVolume(), MASS_TOLERANCE);
        expectClose(expected, "solid", box.computeVolume(), MASS_TOLERANCE);
        expectClose(
            expected,
            "compound",
            new Compound([makeBox(1, 1, 1)]).computeVolume(),
            MASS_TOLERANCE,
        );
    },

    "global-location/located-shapes": expected => {
        let solid = makeBox(1, 1, 1).located(new Pos(1, 2, 3).multiply(new Rot(0, 0, 30)));
        let nested = new Compound([makeBox(1, 1, 1).located(new Pos(1, 2, 3))]).located(
            new Pos(10, 0, 0),
        );
        expectLocationClose(expected, "solid", solid.globalLocation);
        expectLocationClose(expected, "nested_child", nested.solids()[0]!.globalLocation);
    },

    "to-splines/cylinder": expected => {
        let splined = new Cylinder(1, 2).toSplines();
        expect(
            splined
                .faces()
                .map(face => face.geomType)
                .sort(),
            `${expected.name}.surface_types`,
        ).toEqual(fixtureValue(expected, "surface_types"));
        expectClose(expected, "volume", splined.volume, APPROXIMATION_TOLERANCE);
        expectClose(expected, "area", splined.area, APPROXIMATION_TOLERANCE);
        expectCount(expected, "face_count", splined.faces().length);
    },

    "to-splines/degree-and-tolerance": expected => {
        let splined = new Cylinder(1, 2).toSplines({ degree: 5, tolerance: 1e-2 });
        expectClose(expected, "volume", splined.volume, APPROXIMATION_TOLERANCE);
        expectCount(expected, "face_count", splined.faces().length);
    },

    "do-children-intersect/disjoint": expected => {
        let assembly = new Compound([makeBox(1, 1, 1), makeBox(1, 1, 1, [2, 0, 0])]);
        let found = assembly.doChildrenIntersect();
        expect(found.intersect, `${expected.name}.intersect`).toBe(
            fixtureValue(expected, "intersect"),
        );
        expectClose(expected, "volume", found.volume, MASS_TOLERANCE);
    },

    "do-children-intersect/overlapping": expected => {
        let assembly = new Compound([makeBox(2, 2, 2), makeBox(2, 2, 2, [1, 0, 0])]);
        let found = assembly.doChildrenIntersect();
        expect(found.intersect, `${expected.name}.intersect`).toBe(
            fixtureValue(expected, "intersect"),
        );
        expectClose(expected, "volume", found.volume, MASS_TOLERANCE);
        expect(found.shapes, `${expected.name}.pair`).toBeDefined();
        expectRows(expected, "pair_centers", sortedCenters(found.shapes as readonly Shape[]));
    },

    "do-children-intersect/touching": expected => {
        let assembly = new Compound([makeBox(1, 1, 1), makeBox(1, 1, 1, [1, 0, 0])]);
        let found = assembly.doChildrenIntersect();
        expect(found.intersect, `${expected.name}.intersect`).toBe(
            fixtureValue(expected, "intersect"),
        );
        expectClose(expected, "volume", found.volume, MASS_TOLERANCE);
    },

    "do-children-intersect/include-parent": expected => {
        let assembly = new Compound([makeBox(1, 1, 1), makeBox(1, 1, 1, [2, 0, 0])]);
        let found = assembly.doChildrenIntersect({ includeParent: true });
        expect(found.intersect, `${expected.name}.intersect`).toBe(
            fixtureValue(expected, "intersect"),
        );
        expectClose(expected, "volume", found.volume, MASS_TOLERANCE);
    },

    "errors/helpers": expected => {
        let box = new Box(1, 1, 1);
        expect(() => topoDistanceTo([]), `${expected.name}.empty_reference`).toThrow();
        expect(
            () => topoDistanceTo([box.faces()[0]!, box.edges()[0]!]),
            `${expected.name}.mixed_types`,
        ).toThrow();
        expect(() => topoDistanceTo(box), `${expected.name}.unsupported_type`).toThrow();
        expect(
            () => Edge.makeCircle(1).distributeLocations(1),
            `${expected.name}.count_too_small`,
        ).toThrow();
        expect(
            () => Edge.makeLine([0, 0, 0], [1, 1, 1]).curvatureComb(),
            `${expected.name}.comb_not_planar`,
        ).toThrow();
        expect(
            () =>
                Edge.makeCircle(1).findIntersectionPoints(
                    Edge.makeCircle(1, { plane: Plane.YZ.offset(5) }),
                ),
            `${expected.name}.not_coplanar`,
        ).toThrow();
    },
};
