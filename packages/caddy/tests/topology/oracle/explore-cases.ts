import { ShapeType, topology } from "@roonieone/occt-native";
import { expect } from "vite-plus/test";

import type { OracleCases } from "./support.ts";

import {
    expectClose,
    fixtureNumber,
    fixtureString,
} from "../../../../../reference/build123d/oracle.ts";
import { MASS_TOLERANCE } from "../../../../../reference/build123d/tolerances.ts";
import { Axis, Pos } from "../../../src/geometry/index.ts";
import { Compound, Solid } from "../../../src/topology/index.ts";
import { box, cylinder, notchedBox, polygon, sphere } from "./shapes.ts";
import {
    expectCenters,
    expectCounts,
    expectMeasures,
    expectNames,
    expectPoint,
    expectPoints,
} from "./support.ts";

export const exploreCases: OracleCases = {
    "explore/box": expected => {
        let solid = box();
        expectCounts(expected, "counts", solid);
        expectCenters(expected, "vertices", solid.vertices());
        expectCenters(expected, "edge_centers", solid.edges());
        expectMeasures(
            expected,
            "edge_lengths",
            solid.edges().map(edge => edge.length),
        );
        expectCenters(expected, "face_centers", solid.faces());
        expectMeasures(
            expected,
            "face_areas",
            solid.faces().map(face => face.area),
        );
    },
    "explore/cylinder": expected => {
        let solid = cylinder();
        expectCounts(expected, "counts", solid);
        expectCenters(expected, "vertices", solid.vertices());
        expectCenters(expected, "edge_centers", solid.edges());
        expectNames(
            expected,
            "edge_geom_types",
            solid.edges().map(edge => edge.geomType),
        );
        expectCenters(expected, "face_centers", solid.faces());
        expectNames(
            expected,
            "face_geom_types",
            solid.faces().map(face => face.geomType),
        );
    },
    "explore/sphere": expected => {
        let solid = sphere();
        expectCounts(expected, "counts", solid);
        expect(topology.subShapes(solid.wrapped, ShapeType.Edge)).toHaveLength(
            fixtureNumber(expected, "all_edge_count"),
        );
        expectMeasures(
            expected,
            "edge_lengths",
            solid.edges().map(edge => edge.length),
        );
        expectCenters(expected, "face_centers", solid.faces());
    },
    "explore/boolean": expected => {
        let solid = notchedBox();
        expect(solid.constructor.name).toBe(fixtureString(expected, "class_name"));
        expectCounts(expected, "counts", solid);
        expectCenters(expected, "face_centers", solid.faces());
        expectNames(
            expected,
            "face_geom_types",
            solid.faces().map(face => face.geomType),
        );
        expectMeasures(
            expected,
            "edge_lengths",
            solid.edges().map(edge => edge.length),
        );
    },
    "explore/compound": expected => {
        let group = new Compound([box(), cylinder().moved(new Pos(20, 0, 0))]);
        expect(group.length).toBe(fixtureNumber(expected, "length"));
        expectCounts(expected, "counts", group);
        expectNames(
            expected,
            "child_classes",
            [...group].map(child => child.constructor.name),
        );
        expectNames(
            expected,
            "top_level_classes",
            group.getTopLevelShapes().map(shape => shape.constructor.name),
        );
        expect(group.getType(Solid)).toHaveLength(fixtureNumber(expected, "solid_count"));
        expectClose(expected, "volume", group.volume, MASS_TOLERANCE);
        expectPoint(expected, "center", group.center());
    },
    "explore/nested-compound": expected => {
        let nested = new Compound([new Compound([cylinder()]), box()]);
        expect(nested.length).toBe(fixtureNumber(expected, "length"));
        expect(nested.compounds()).toHaveLength(fixtureNumber(expected, "compound_count"));
        expectNames(
            expected,
            "top_level_classes",
            nested.getTopLevelShapes().map(shape => shape.constructor.name),
        );
        expectCenters(expected, "top_level_centers", nested.getTopLevelShapes());
        expect(new Compound([box()]).unwrap().constructor.name).toBe(
            fixtureString(expected, "unwrapped_class"),
        );
        expect(
            new Compound([new Compound([box()])]).unwrap({ fully: false }).constructor.name,
        ).toBe(fixtureString(expected, "unwrapped_shallow_class"));
        expectClose(expected, "volume", nested.volume, MASS_TOLERANCE);
    },
    "explore/wire-edges": expected => {
        let wire = polygon();
        expectPoints(
            expected,
            "starts",
            wire.edges().map(edge => edge.positionAt(0)),
        );
        expectPoints(
            expected,
            "ends",
            wire.edges().map(edge => edge.positionAt(1)),
        );
        expectMeasures(
            expected,
            "lengths",
            wire.edges().map(edge => edge.length),
        );
        expectCenters(expected, "vertices", wire.vertices());
    },
    "explore/singular": expected => {
        let solid = box();
        let face = solid.faces().first;
        expectPoint(expected, "face_wire_center", face.wire().center());
        expect(solid.shell().faces()).toHaveLength(fixtureNumber(expected, "shell_face_count"));
        expectClose(expected, "solid_volume", solid.solid().volume, MASS_TOLERANCE);
        expectPoint(expected, "vertex_point", face.edges().first.vertices().first.center());
    },
    "explore/faces-intersected-by-axis": expected => {
        let solid = box();
        let faces = solid.facesIntersectedByAxis(new Axis([5, 3, -2], [0, 0, 1]));
        expectCenters(expected, "centers", faces);
        expect(faces).toHaveLength(fixtureNumber(expected, "count"));
        expect(solid.facesIntersectedByAxis(new Axis([20, 20, 0], [0, 0, 1]))).toHaveLength(
            fixtureNumber(expected, "empty_count"),
        );
    },
};
