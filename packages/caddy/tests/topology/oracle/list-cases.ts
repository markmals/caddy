import { primitives } from "@roonieone/occt-native";
import { expect } from "vite-plus/test";

import type { FixtureCase } from "../../../../../reference/build123d/oracle.ts";
import type { Shape } from "../../../src/topology/index.ts";
import type { OracleCases } from "./support.ts";

import {
    expectNumbersClose,
    fixtureBoolean,
    fixtureNumber,
    fixtureRecord,
    fixtureValue,
} from "../../../../../reference/build123d/oracle.ts";
import { LINEAR_TOLERANCE } from "../../../../../reference/build123d/tolerances.ts";
import { Axis, Plane, Pos } from "../../../src/geometry/index.ts";
import { Compound, GeomType, ShapeList, Solid, SortBy } from "../../../src/topology/index.ts";
import { box, cone, cylinder, notchedBox } from "./shapes.ts";
import { expectCenters, expectMeasures, expectPoint } from "./support.ts";

function expectGroups<T extends Shape>(
    expected: FixtureCase,
    key: string,
    groups: Iterable<ShapeList<T>>,
): void {
    let record = fixtureRecord(expected, key);
    let actual = [...groups];
    expect(actual).toHaveLength((fixtureValue(record, "keys") as unknown[]).length);
    expectNumbersClose(
        record,
        "sizes",
        actual.map(group => group.length),
        LINEAR_TOLERANCE,
    );
    let expectedCenters = fixtureValue(record, "centers");
    if (!Array.isArray(expectedCenters)) throw new Error("expected groups of centers");
    actual.forEach((group, index) => {
        let groupRecord: FixtureCase = {
            ...record,
            path: `${record.path}.centers[${index}]`,
            data: { centers: expectedCenters[index] },
        };
        expectCenters(groupRecord, "centers", group);
    });
}

export const listCases: OracleCases = {
    "shapelist/filter-by-geom-type": expected => {
        let faces = notchedBox().faces;
        expectCenters(expected, "planes", faces.filter(GeomType.Plane));
        expectCenters(expected, "cylinders", faces.filter(GeomType.Cylinder));
        expectCenters(expected, "not_planes", faces.filter(GeomType.Plane, { reverse: true }));
    },
    "shapelist/filter-by-axis": expected => {
        let solid = notchedBox();
        expectCenters(expected, "faces_z", solid.faces.filter(Axis.Z));
        expectCenters(expected, "faces_x", solid.faces.filter(Axis.X));
        expectCenters(expected, "edges_z", solid.edges.filter(Axis.Z));
        expectCenters(expected, "edges_z_reversed", solid.edges.filter(Axis.Z, { reverse: true }));
    },
    "shapelist/filter-by-plane": expected => {
        let solid = notchedBox();
        expectCenters(expected, "faces_xy", solid.faces.filter(Plane.XY));
        expectCenters(expected, "edges_xy", solid.edges.filter(Plane.XY));
        expect(solid.wires.filter(Plane.XY)).toHaveLength(fixtureNumber(expected, "wires_xy"));
    },
    "shapelist/filter-by-predicate": expected => {
        let faces = box().faces;
        expectCenters(
            expected,
            "large",
            faces.filter(face => face.area > 30),
        );
        expectCenters(
            expected,
            "small",
            faces.filter(face => face.area <= 30),
        );
    },
    "shapelist/filter-by-position": expected => {
        let vertices = box().vertices;
        expectCenters(expected, "inclusive", vertices.filterByPosition(Axis.X, 0, 10));
        expectCenters(
            expected,
            "exclusive",
            vertices.filterByPosition(Axis.X, 0, 10, [false, false]),
        );
        expectCenters(
            expected,
            "half_open",
            vertices.filterByPosition(Axis.X, 0, 10, [true, false]),
        );
        expectCenters(expected, "sorted_along", vertices.filterByPosition(Axis.Y, -1, 7));
    },
    "shapelist/sort-by-axis": expected => {
        let faces = notchedBox().faces;
        expectCenters(expected, "by_z", faces.toSorted(Axis.Z));
        expectCenters(expected, "by_x_reversed", faces.toSorted(Axis.X, { reverse: true }));
        expectCenters(expected, "vertices_by_y", box().vertices.toSorted(Axis.Y));
    },
    "shapelist/sort-by-measure": expected => {
        let solid = notchedBox();
        expectMeasures(
            expected,
            "faces_by_area",
            solid.faces.toSorted(SortBy.Area).map(face => face.area),
        );
        expectMeasures(
            expected,
            "edges_by_length",
            solid.edges.toSorted(SortBy.Length).map(edge => edge.length),
        );
        expectMeasures(
            expected,
            "circles_by_radius",
            cone()
                .edges.filter(GeomType.Circle)
                .toSorted(SortBy.Radius)
                .map(edge => edge.radius),
        );
        expectMeasures(
            expected,
            "solids_by_volume",
            new Compound([box(), cylinder()]).solids
                .toSorted(SortBy.Volume)
                .map(solid => solid.volume),
        );
    },
    "shapelist/sort-by-distance": expected => {
        let vertices = box().vertices;
        expectCenters(expected, "from_point", vertices.toSortedByDistance([0, 0, 0]));
        expectCenters(
            expected,
            "from_point_reversed",
            vertices.toSortedByDistance([0, 0, 0], { reverse: true }),
        );
        let pointBox = new Solid(primitives.makeBox(1, 1, 1)).moved(new Pos(20, 3, 2));
        expectCenters(expected, "from_shape", box().faces.toSortedByDistance(pointBox));
    },
    "shapelist/group-by-axis": expected => {
        let vertices = box().vertices.groupBy(Axis.Z);
        let faces = notchedBox().faces.groupBy(Axis.Z, { reverse: true });
        expectGroups(expected, "vertices", vertices);
        expectGroups(expected, "faces_reversed", faces);
        expectNumbersClose(
            fixtureRecord(expected, "vertices"),
            "keys",
            vertices.groups.map(group => group.first.center.z),
            LINEAR_TOLERANCE,
        );
        expectNumbersClose(
            fixtureRecord(expected, "faces_reversed"),
            "keys",
            faces.groups.map(group => group.first.center.z),
            LINEAR_TOLERANCE,
        );
    },
    "shapelist/group-by-measure": expected => {
        let edges = box().edges.groupBy(SortBy.Length);
        let faces = box().faces.groupBy(SortBy.Area, { tolDigits: 3 });
        expectGroups(expected, "edges_by_length", edges);
        expectGroups(expected, "faces_by_area", faces);
        expectNumbersClose(
            fixtureRecord(expected, "edges_by_length"),
            "keys",
            edges.groups.map(group => group.first.length),
            LINEAR_TOLERANCE,
        );
        expectNumbersClose(
            fixtureRecord(expected, "faces_by_area"),
            "keys",
            faces.groups.map(group => group.first.area),
            LINEAR_TOLERANCE,
        );
    },
    "shapelist/set-ops": expected => {
        let solid = box();
        let faces = solid.faces;
        let top = solid.faces.filter(Axis.Z);
        expect(faces.intersection(top)).toHaveLength(fixtureNumber(expected, "intersection"));
        expect(faces.difference(top)).toHaveLength(fixtureNumber(expected, "difference"));
        expect(top.concat(solid.faces.filter(Axis.X))).toHaveLength(
            fixtureNumber(expected, "combined"),
        );
        expect(faces.equals(solid.faces)).toBe(fixtureBoolean(expected, "equal_self"));
        expect(faces.equals(top)).toBe(fixtureBoolean(expected, "equal_subset"));
    },
    "shapelist/slice": expected => {
        let faces = box().faces.toSorted(Axis.Z);
        let middle = faces.slice(1, 3);
        let backwards = faces.toReversed();
        expect(middle.constructor.name).toBe(fixtureValue(expected, "slice_class"));
        expectCenters(expected, "slice_centers", middle);
        expect(backwards.constructor.name).toBe(fixtureValue(expected, "reversed_class"));
        expectCenters(expected, "reversed_centers", backwards);
    },
    "shapelist/expand-center": expected => {
        let solid = box();
        let nested = new Compound([new Compound([solid.faces.first]), solid.wires.first]);
        let expanded = new ShapeList([nested]).expand();
        expect(fixtureValue(expected, "expanded_classes")).toEqual(
            expanded.map(shape => shape.constructor.name),
        );
        expectCenters(expected, "expanded_centers", expanded);
        expect(nested.topLevelShapes).toHaveLength(fixtureNumber(expected, "top_level_count"));
        expectPoint(expected, "faces_center", solid.faces.center);
        expectPoint(expected, "vertices_center", solid.vertices.center);
        expectPoint(expected, "empty_center", solid.compounds.center);
    },
};
