import { expect } from "vite-plus/test";

import type { OracleCases } from "./support.ts";

import {
    expectClose,
    fixtureBoolean,
    fixtureNumber,
} from "../../../../../reference/build123d/oracle.ts";
import { MASS_TOLERANCE } from "../../../../../reference/build123d/tolerances.ts";
import { Axis } from "../../../src/geometry/index.ts";
import { CenterOf, GeomType } from "../../../src/topology/index.ts";
import { box, cylinder, plateWithHole } from "./shapes.ts";
import { expectMeasures, expectPoint } from "./support.ts";

export const faceCases: OracleCases = {
    "face/planar": expected => {
        let face = box().faces().sortBy(Axis.Z).last;
        let plane = face.isPlanar;
        if (plane === undefined) throw new Error("expected a planar face");
        expectPoint(expected, "normal_at", face.normalAt());
        expectPoint(expected, "normal_at_point", face.normalAt([2, 2, 4]));
        expectPoint(expected, "normal_at_uv", face.normalAt(0.25, 0.75));
        expectPoint(expected, "position_at", face.positionAt(0.25, 0.75));
        expectPoint(expected, "center_geometry", face.center(CenterOf.Geometry));
        expectPoint(expected, "center_mass", face.center(CenterOf.Mass));
        expectPoint(expected, "plane_origin", plane.origin);
        expectPoint(expected, "plane_z_dir", plane.zDir);
        expect(face.isInside([5, 3, 4])).toBe(fixtureBoolean(expected, "is_inside"));
        expect(face.isInside([50, 3, 4])).toBe(fixtureBoolean(expected, "is_outside"));
        expectClose(expected, "outer_wire_length", face.outerWire().length, MASS_TOLERANCE);
        expect(face.innerWires()).toHaveLength(fixtureNumber(expected, "inner_wire_count"));
    },
    "face/cylindrical": expected => {
        let face = cylinder().faces().filterBy(GeomType.Cylinder).first;
        expect(face.isPlanar !== undefined).toBe(fixtureBoolean(expected, "is_planar"));
        expectPoint(expected, "normal_at_uv", face.normalAt(0.25, 0.5));
        expectPoint(expected, "position_at", face.positionAt(0.25, 0.5));
        expectPoint(expected, "normal_at_point", face.normalAt([3, 0, 4]));
        expectPoint(expected, "center_geometry", face.center(CenterOf.Geometry));
        expectPoint(expected, "center_mass", face.center(CenterOf.Mass));
        expectClose(expected, "area", face.area, MASS_TOLERANCE);
        expectClose(expected, "outer_wire_length", face.outerWire().length, MASS_TOLERANCE);
    },
    "face/with-hole": expected => {
        let face = plateWithHole();
        expectClose(expected, "area", face.area, MASS_TOLERANCE);
        expect(face.wires()).toHaveLength(fixtureNumber(expected, "wire_count"));
        expectClose(expected, "outer_wire_length", face.outerWire().length, MASS_TOLERANCE);
        expectMeasures(
            expected,
            "inner_wire_lengths",
            face.innerWires().map(wire => wire.length),
        );
        expectPoint(expected, "center_geometry", face.center(CenterOf.Geometry));
        expectPoint(expected, "center_mass", face.center(CenterOf.Mass));
        expect(face.isInside([10, 6, 0])).toBe(fixtureBoolean(expected, "inside_hole"));
        expect(face.isInside([2, 2, 0])).toBe(fixtureBoolean(expected, "inside_material"));
        expectPoint(expected, "normal_at", face.normalAt());
    },
};
