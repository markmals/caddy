import { expect } from "vite-plus/test";

import type { OracleCases } from "./support.ts";

import {
    expectClose,
    expectNumbersClose,
    fixtureBoolean,
    fixtureNumber,
    fixtureString,
} from "../../../../../reference/build123d/oracle.ts";
import { LINEAR_TOLERANCE, MASS_TOLERANCE } from "../../../../../reference/build123d/tolerances.ts";
import { Axis, Pos, Vector } from "../../../src/geometry/index.ts";
import { CenterOf, Compound, Edge, GeomType, Shape } from "../../../src/topology/index.ts";
import { box, cylinder } from "./shapes.ts";
import { expectBoundsRecord, expectMeasures, expectPoint, expectShapeMetrics } from "./support.ts";

export const propertyCases: OracleCases = {
    "properties/box": expected => {
        let solid = box();
        expectShapeMetrics(expected, "shape", solid);
        expectPoint(expected, "center_mass", solid.center(CenterOf.Mass));
        expectPoint(expected, "center_bounding_box", solid.center(CenterOf.BoundingBox));
        expectBoundsRecord(expected, "bounds_optimal", solid.boundingBox());
        expectBoundsRecord(expected, "bounds_coarse", solid.boundingBox(undefined, false));
        expect(solid.isValid).toBe(fixtureBoolean(expected, "is_valid"));
        expect(solid.shapeType).toBe(fixtureString(expected, "shape_type"));
        expect(solid.geomType).toBe(fixtureString(expected, "geom_type"));
    },
    "properties/cylinder": expected => {
        let solid = cylinder();
        expectShapeMetrics(expected, "shape", solid);
        expectPoint(expected, "center_mass", solid.center(CenterOf.Mass));
        expectPoint(expected, "center_bounding_box", solid.center(CenterOf.BoundingBox));
        expectBoundsRecord(expected, "bounds_optimal", solid.boundingBox());
        expectBoundsRecord(expected, "bounds_coarse", solid.boundingBox(undefined, false));
    },
    "properties/face": expected => {
        let top = box().faces().sortBy(Axis.Z).last;
        let side = cylinder().faces().filterBy(GeomType.Cylinder).first;
        expectClose(expected, "top_area", top.area, MASS_TOLERANCE);
        expectClose(expected, "top_volume", top.volume, MASS_TOLERANCE);
        expectPoint(expected, "top_center_geometry", top.center(CenterOf.Geometry));
        expectPoint(expected, "top_center_mass", top.center(CenterOf.Mass));
        expect(top.geomType).toBe(fixtureString(expected, "top_geom_type"));
        expectClose(expected, "side_area", side.area, MASS_TOLERANCE);
        expectPoint(expected, "side_center_geometry", side.center(CenterOf.Geometry));
        expectPoint(expected, "side_center_mass", side.center(CenterOf.Mass));
        expect(side.geomType).toBe(fixtureString(expected, "side_geom_type"));
        expectBoundsRecord(expected, "side_bounds", side.boundingBox());
    },
    "properties/edge": expected => {
        let line = Edge.makeLine([1, 2, 3], [7, 10, 3]);
        let arc = Edge.makeCircle(5, { startAngle: 0, endAngle: 90 });
        expectClose(expected, "line_length", line.length, MASS_TOLERANCE);
        expectClose(expected, "line_volume", line.volume, MASS_TOLERANCE);
        expectClose(expected, "line_area", line.area, MASS_TOLERANCE);
        expectPoint(expected, "line_center_geometry", line.center(CenterOf.Geometry));
        expectPoint(expected, "line_center_mass", line.center(CenterOf.Mass));
        expectPoint(expected, "line_center_bounding_box", line.center(CenterOf.BoundingBox));
        expect(line.isClosed).toBe(fixtureBoolean(expected, "line_is_closed"));
        expectClose(expected, "arc_length", arc.length, MASS_TOLERANCE);
        expectPoint(expected, "arc_center_geometry", arc.center(CenterOf.Geometry));
        expectPoint(expected, "arc_center_mass", arc.center(CenterOf.Mass));
        expect(arc.isClosed).toBe(fixtureBoolean(expected, "arc_is_closed"));
        expect(Edge.makeCircle(5).isClosed).toBe(fixtureBoolean(expected, "circle_is_closed"));
    },
    "properties/vertex": expected => {
        let vertex = box().vertices().sortBy(Axis.X).last;
        expectPoint(expected, "center", vertex.center());
        expectNumbersClose(
            expected,
            "coordinates",
            [vertex.x, vertex.y, vertex.z],
            LINEAR_TOLERANCE,
        );
        expectClose(expected, "volume", vertex.volume, MASS_TOLERANCE);
        expectBoundsRecord(expected, "bounds", vertex.boundingBox());
        expectPoint(expected, "sum", vertex.add(new Vector(1, 2, 3)).center());
        expectPoint(expected, "difference", vertex.sub(new Vector(1, 2, 3)).center());
    },
    "properties/shell": expected => {
        let shell = box().shells().first;
        expectClose(expected, "area", shell.area, MASS_TOLERANCE);
        expectClose(expected, "volume", shell.volume, MASS_TOLERANCE);
        expectPoint(expected, "center", shell.center());
        expect(shell.isManifold).toBe(fixtureBoolean(expected, "is_manifold"));
        expect(shell.faces()).toHaveLength(fixtureNumber(expected, "face_count"));
    },
    "properties/compound": expected => {
        let group = new Compound([box(), cylinder().moved(new Pos(20, 0, 0))]);
        let faces = new Compound(box().faces().slice(0, 2));
        expectClose(expected, "volume", group.volume, MASS_TOLERANCE);
        expectClose(expected, "area", group.area, MASS_TOLERANCE);
        expectPoint(expected, "center_mass", group.center(CenterOf.Mass));
        expectPoint(expected, "center_bounding_box", group.center(CenterOf.BoundingBox));
        expectBoundsRecord(expected, "bounds", group.boundingBox());
        expectPoint(expected, "face_compound_center", faces.center());
        expectClose(expected, "face_compound_volume", faces.volume, MASS_TOLERANCE);
    },
    "properties/distance": expected => {
        let solid = box();
        let other = cylinder().moved(new Pos(20, 0, 0));
        let [first, second] = solid.closestPoints(other);
        expectClose(expected, "distance", solid.distance(other), LINEAR_TOLERANCE);
        expectClose(expected, "distance_to_point", solid.distanceTo([20, 3, 2]), LINEAR_TOLERANCE);
        expectPoint(expected, "closest_on_self", first);
        expectPoint(expected, "closest_on_other", second);
        expectMeasures(
            expected,
            "distances",
            solid.distances(other, cylinder().moved(new Pos(0, 20, 0))),
        );
    },
    "properties/combined-center": expected => {
        let solids = [box(), cylinder().moved(new Pos(20, 0, 0))];
        expectPoint(expected, "mass", Shape.combinedCenter(solids, CenterOf.Mass));
        expectPoint(expected, "bounds", Shape.combinedCenter(solids, CenterOf.BoundingBox));
    },
    "properties/fix-valid": expected => {
        let solid = box();
        let fixed = solid.fix();
        expect(fixed === solid).toBe(fixtureBoolean(expected, "same_object"));
        expect(fixed.isValid).toBe(fixtureBoolean(expected, "valid"));
        expectClose(expected, "volume", fixed.volume, MASS_TOLERANCE);
    },
};
