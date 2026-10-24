import { expect } from "vite-plus/test";

import type { FixtureCase } from "../../../../reference/build123d/oracle.ts";
import type { Shape, Vector } from "../../src/index.ts";

import {
    expectClose,
    expectNumbersClose,
    expectVectorClose,
    fixtureBoolean,
    fixtureNumber,
    fixtureRecord,
    fixtureString,
    fixtureValue,
    oracleSuite,
} from "../../../../reference/build123d/oracle.ts";
import {
    ANGULAR_TOLERANCE,
    LINEAR_TOLERANCE,
    MASS_TOLERANCE,
} from "../../../../reference/build123d/tolerances.ts";
import {
    Axis,
    Box,
    Cylinder,
    Edge,
    Face,
    GeomType,
    Location,
    offset,
    Plane,
    Polygon,
    Pos,
    Rectangle,
    RectangleRounded,
    Sphere,
    Torus,
    Wire,
} from "../../src/index.ts";
import { expectLocation } from "../geometry/oracle/support.ts";
import { expectNames, expectPoints, expectShapeMetrics } from "../topology/oracle/support.ts";

/** An open right-angled polyline, as a wire of two straight edges. */
function polyline(): Wire {
    return new Wire([Edge.makeLine([0, 0], [4, 0]), Edge.makeLine([4, 0], [4, 3])]);
}

/** A measure build123d answers `None` for, where Caddy answers `undefined`. */
function expectOptionalMeasure(
    expected: FixtureCase,
    key: string,
    actual: number | undefined,
): void {
    if (actual === undefined) {
        expect(null, `${expected.name}.${key}`).toBe(fixtureValue(expected, key));
        return;
    }
    expectClose(expected, key, actual, LINEAR_TOLERANCE);
}

/** The `extents` serializer: how far a face reaches along each axis of its own plane. */
function expectExtents(expected: FixtureCase, key: string, face: Face): void {
    let record = fixtureRecord(expected, key);
    expectOptionalMeasure(record, "length", face.length);
    expectOptionalMeasure(record, "width", face.width);
}

/** The `ends` serializer: where each edge of a line starts and ends, in wire order. */
function expectEnds(expected: FixtureCase, line: Edge | Wire): void {
    let edges = line.edges;
    expectPoints(
        expected,
        "starts",
        edges.map(edge => edge.startPoint),
    );
    expectPoints(
        expected,
        "ends",
        edges.map(edge => edge.endPoint),
    );
}

/** The `closed` serializer: the class, closure, edges and length of what `close()` answered. */
function expectClosed(expected: FixtureCase, key: string, actual: Edge | Wire): void {
    let record = fixtureRecord(expected, key);
    expect(actual.constructor.name, `${expected.name}.${key}.class_name`).toBe(
        fixtureString(record, "class_name"),
    );
    expect(actual.isClosed, `${expected.name}.${key}.is_closed`).toBe(
        fixtureBoolean(record, "is_closed"),
    );
    expect(actual.edges.length, `${expected.name}.${key}.edge_count`).toBe(
        fixtureNumber(record, "edge_count"),
    );
    expectClose(record, "length", actual.length, MASS_TOLERANCE);
    expectNames(
        record,
        "edge_geom_types",
        actual.edges.map(edge => edge.geomType),
    );
    expectEnds(record, actual);
}

/** The `trimmed` serializer: the piece `trimToOther` kept, or nothing when they never meet. */
function expectTrimmed(expected: FixtureCase, key: string, actual: Edge | undefined): void {
    if (actual === undefined) {
        expect(null, `${expected.name}.${key}`).toBe(fixtureValue(expected, key));
        return;
    }
    let record = fixtureRecord(expected, key);
    expectClose(record, "length", actual.length, MASS_TOLERANCE);
    expectEnds(record, actual);
}

/** The `outline` serializer: the edge and vertex order of a sketch outline. */
function expectOutline(expected: FixtureCase, key: string, sketch: Shape): void {
    let record = fixtureRecord(expected, key);
    let wire = sketch.wire;
    expectNames(
        record,
        "edge_geom_types",
        wire.edges.map(edge => edge.geomType),
    );
    expectEnds(record, wire);
    expectPoints(
        record,
        "wire_vertices",
        wire.vertices.map(vertex => vertex.center),
    );
    expectPoints(
        record,
        "face_vertices",
        sketch.face.vertices.map(vertex => vertex.center),
    );
}

/** Whether a member raised, against the flag the fixture holds for build123d raising. */
function expectRaises(expected: FixtureCase, key: string, attempt: () => unknown): void {
    let raised = false;
    try {
        attempt();
    } catch {
        raised = true;
    }
    expect(raised, `${expected.name}.${key}`).toBe(fixtureBoolean(expected, key));
}

oracleSuite("gaps", {
    "face/radius": expected => {
        let torusWall = new Torus(10, 2).faces.filter(GeomType.Torus).first;
        expectOptionalMeasure(
            expected,
            "cylinder",
            new Cylinder(1.5, 2).faces.filter(GeomType.Cylinder).first.radius,
        );
        expectOptionalMeasure(
            expected,
            "sphere",
            new Sphere(3).faces.filter(GeomType.Sphere).first.radius,
        );
        expectOptionalMeasure(expected, "torus", torusWall.radius);
        expectNumbersClose(expected, "torus_radii", torusWall.radii ?? [], LINEAR_TOLERANCE);
        expectOptionalMeasure(expected, "plane", new Box(1, 1, 1).faces.first.radius);
    },

    "face/radius-of-a-trimmed-surface": expected => {
        let grown = offset(new Box(10, 10, 10), 1);
        let cylinders = grown.faces.filter(GeomType.Cylinder);
        let spheres = grown.faces.filter(GeomType.Sphere);
        expect(cylinders.length, `${expected.name}.cylinder_count`).toBe(
            fixtureNumber(expected, "cylinder_count"),
        );
        expect(
            cylinders.map(face => face.radius ?? null),
            `${expected.name}.cylinder_radii`,
        ).toEqual(fixtureValue(expected, "cylinder_radii"));
        expect(spheres.length, `${expected.name}.sphere_count`).toBe(
            fixtureNumber(expected, "sphere_count"),
        );
        expectNumbersClose(
            expected,
            "sphere_radii",
            spheres.map(face => face.radius ?? Number.NaN).toSorted((a, b) => a - b),
            LINEAR_TOLERANCE,
        );
    },

    "face/length-and-width": expected => {
        let box = new Box(3, 5, 7);
        expectExtents(expected, "rect_xz", Face.makeRect(8, 10, Plane.XZ));
        expectExtents(expected, "box_top", box.faces.toSorted(Axis.Z).last);
        expectExtents(expected, "box_side", box.faces.toSorted(Axis.Y).first);
        expectExtents(
            expected,
            "triangle",
            new Polygon([
                [0, 0],
                [4, 0],
                [4, 3],
            ]).face,
        );
        expectExtents(
            expected,
            "cylinder_wall",
            new Cylinder(2, 5).faces.filter(GeomType.Cylinder).first,
        );
    },

    "line/normal": expected => {
        let tilted = new Plane({ origin: [1, 2, 3], zDir: [1, 1, 1] }).transform(
            polyline().close(),
        );
        let normals: Record<string, () => Vector> = {
            circle_xy: () => Edge.makeCircle(2).normal,
            circle_xz: () => Edge.makeCircle(2, { plane: Plane.XZ }).normal,
            ellipse_yz: () => Edge.makeEllipse(3, 1, { plane: Plane.YZ }).normal,
            arc: () => Edge.makeCircle(2, { startAngle: 0, endAngle: 120 }).normal,
            polyline: () => polyline().normal,
            closed_polyline: () => polyline().close().normal,
            tilted_polyline: () => tilted.normal,
        };
        for (let [key, normal] of Object.entries(normals)) {
            expectVectorClose(expected, key, normal().toTuple(), ANGULAR_TOLERANCE);
        }
        let shared = polyline().commonPlane();
        expect(shared, `${expected.name}.polyline_common_plane_z_dir`).toBeDefined();
        expectVectorClose(
            expected,
            "polyline_common_plane_z_dir",
            (shared ?? Plane.XY).zDir.toTuple(),
            ANGULAR_TOLERANCE,
        );
    },

    "line/normal-errors": expected => {
        expectRaises(expected, "line_raises", () => Edge.makeLine([0, 0, 0], [1, 1, 1]).normal);
        expectRaises(expected, "helix_raises", () => Edge.makeHelix(1, 4, 1).normal);
    },

    "line/radius": expected => {
        expectClose(expected, "circle_edge", Edge.makeCircle(2.5).radius, LINEAR_TOLERANCE);
        expectClose(
            expected,
            "arc_edge",
            Edge.makeCircle(2.5, { startAngle: 20, endAngle: 140 }).radius,
            LINEAR_TOLERANCE,
        );
        expectClose(expected, "circle_wire", Wire.makeCircle(2.5).radius, LINEAR_TOLERANCE);
        expectRaises(expected, "line_raises", () => Edge.makeLine([0, 0, 0], [1, 0, 0]).radius);
        expectRaises(expected, "polyline_raises", () => polyline().radius);
    },

    "line/close": expected => {
        let circle = Edge.makeCircle(2);
        let closedWire = Wire.makeCircle(2);
        expectClosed(
            expected,
            "open_edge",
            Edge.makeCircle(2, { startAngle: 0, endAngle: 180 }).close(),
        );
        expectClosed(expected, "closed_edge", circle.close());
        expect(circle.close() === circle, `${expected.name}.closed_edge_is_self`).toBe(
            fixtureBoolean(expected, "closed_edge_is_self"),
        );
        expectClosed(expected, "open_wire", polyline().close());
        expectClosed(expected, "closed_wire", closedWire.close());
        expect(closedWire.close() === closedWire, `${expected.name}.closed_wire_is_self`).toBe(
            fixtureBoolean(expected, "closed_wire_is_self"),
        );
    },

    "plane/transform": expected => {
        let source = new Plane({ origin: [1, 2, 3], xDir: [0, 1, 0], zDir: [1, 0, 0] });
        let placed = source.transform([new Pos(1, 0, 0), Plane.XZ]);
        expectLocation(
            expected,
            "by_location",
            source.transform(Location.fromOrientation([1, 0, 0], [0, 0, 45])),
        );
        expectLocation(expected, "by_plane", source.transform(Plane.YZ));
        expect(placed.length, `${expected.name}.by_list_count`).toBe(
            fixtureNumber(expected, "by_list_count"),
        );
        expectLocation(expected, "by_list_location", placed[0] ?? source.location);
        expectLocation(expected, "by_list_plane", placed[1] ?? source.location);
        expectShapeMetrics(expected, "by_shape", source.transform(new Box(1, 2, 3)));
        expectVectorClose(
            expected,
            "by_shape_center",
            source.transform(new Box(1, 2, 3)).center.toTuple(),
            LINEAR_TOLERANCE,
        );
    },

    "edge/trim-to-other": expected => {
        let base = Edge.makeLine([0, 0, 0], [10, 0, 0]);
        // A V crossing the base twice, at x = 2.5 and x = 3.5.
        let zigzag = new Wire([
            Edge.makeLine([2, -1, 0], [3, 1, 0]),
            Edge.makeLine([3, 1, 0], [4, -1, 0]),
        ]);
        expectTrimmed(expected, "shape", base.trimToOther(Edge.makeLine([4, -2, 0], [4, 2, 0])));
        expectTrimmed(expected, "axis", base.trimToOther(new Axis([3, -1, 0], [0, 1, 0])));
        expectTrimmed(expected, "plane", base.trimToOther(Plane.YZ.offset(6)));
        expectTrimmed(expected, "location", base.trimToOther(new Pos(5, 0, 0)));
        expectTrimmed(expected, "point", base.trimToOther([2, 0, 0]));
        expectTrimmed(expected, "two_crossings", base.trimToOther(zigzag));
        expectTrimmed(expected, "missed_point", base.trimToOther([2, 5, 0]));
        expectTrimmed(expected, "missed_plane", base.trimToOther(Plane.YZ.offset(60)));
    },

    "sketch/outline-order": expected => {
        expectOutline(expected, "rectangle", new Rectangle(6, 4));
        expectOutline(expected, "rectangle_rounded", new RectangleRounded(6, 4, 1));
        expectOutline(
            expected,
            "polygon",
            new Polygon([
                [0, 0],
                [4, 0],
                [4, 3],
            ]),
        );
    },
});
