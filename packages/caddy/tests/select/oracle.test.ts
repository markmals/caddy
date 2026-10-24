import { expect } from "vite-plus/test";

import type { FixtureCase } from "../../../../reference/build123d/oracle.ts";
import type { Select, Shape } from "../../src/index.ts";

import {
    expectNumbersClose,
    fixtureNumber,
    fixtureRecord,
    fixtureValue,
    oracleSuite,
} from "../../../../reference/build123d/oracle.ts";
import { MASS_TOLERANCE } from "../../../../reference/build123d/tolerances.ts";
import {
    Align,
    Axis,
    Box,
    Curve,
    Cylinder,
    Edge,
    Line,
    Pos,
    Rectangle,
    Select as SelectMode,
    Solid,
    Sphere,
    Wire,
} from "../../src/index.ts";
import { expectPoints, sortedPoints } from "../topology/oracle/support.ts";

/** A cylinder standing on top of the ten-cube, overlapping nothing but its top face. */
function standingCylinder(radius: number, height: number): Cylinder {
    let align = [Align.Center, Align.Center, Align.Min] as const;
    return new Cylinder(radius, height, { align }).moved(new Pos(0, 0, 5));
}

/** How many sub-shapes of each kind `select` reports, as the `counts` helper records them. */
function expectCounts(expected: FixtureCase, key: string, shape: Shape, select: Select): void {
    let record = fixtureRecord(expected, key);
    let counted: Record<string, number> = {
        vertices: shape.vertices({ select }).length,
        edges: shape.edges({ select }).length,
        wires: shape.wires({ select }).length,
        faces: shape.faces({ select }).length,
        shells: shape.shells({ select }).length,
        solids: shape.solids({ select }).length,
    };
    for (let [kind, count] of Object.entries(counted)) {
        expect(count, `${expected.name}.${key}.${kind}`).toBe(fixtureNumber(record, kind));
    }
}

/** The whole `every_select` record: the class of the result and its three sets of counts. */
function expectEverySelect(expected: FixtureCase, shape: Shape): void {
    expect(shape.constructor.name, `${expected.name}.class_name`).toBe(
        fixtureValue(expected, "class_name"),
    );
    expectCounts(expected, "all", shape, SelectMode.All);
    expectCounts(expected, "last", shape, SelectMode.Last);
    expectCounts(expected, "new", shape, SelectMode.New);
}

function expectNames(expected: FixtureCase, key: string, actual: readonly string[]): void {
    expect(actual, `${expected.name}.${key}`).toEqual(fixtureValue(expected, key));
}

oracleSuite("select", {
    "fuse/every-shape-type": expected => {
        expectEverySelect(expected, new Box(10, 10, 10).union(standingCylinder(2, 5)));
    },
    "fuse/last-faces-sit-on-top": expected => {
        let part = new Box(10, 10, 10).union(standingCylinder(2, 5));
        let last = part.faces({ select: SelectMode.Last });
        expect(last.length, `${expected.name}.count`).toBe(fixtureNumber(expected, "count"));
        expectNames(expected, "geom_types", last.map(face => face.geomType).toSorted());
        expect(
            last.every(face => face.center().z > 5),
            `${expected.name}.above_the_box`,
        ).toBe(fixtureValue(expected, "above_the_box"));
        expectNumbersClose(
            expected,
            "areas",
            last.map(face => face.area).toSorted((a, b) => a - b),
            MASS_TOLERANCE,
        );
    },
    "fuse/crossed-sketches": expected => {
        let cross = new Rectangle(8, 2).union(new Rectangle(2, 8));
        expectEverySelect(expected, cross);
        expectPoints(
            expected,
            "new_vertices",
            sortedPoints(cross.vertices({ select: SelectMode.New }).map(vertex => vertex.center())),
        );
    },
    "fuse/disjoint-pieces": expected => {
        let pieces = new Box(10, 10, 10).union(new Box(10, 10, 10).moved(new Pos(30, 0, 0)));
        expectEverySelect(expected, pieces);
        expectPoints(
            expected,
            "last_solid_centers",
            sortedPoints(pieces.solids({ select: SelectMode.Last }).map(solid => solid.center())),
        );
    },
    "fuse/self-was-there-before": expected => {
        let two = new Rectangle(2, 2).union(new Rectangle(2, 2).moved(new Pos(5, 0, 0)));
        let plus = two.union(new Rectangle(1, 4).moved(new Pos(5, 0, 0)));
        expect(plus.faces().length, `${expected.name}.face_count`).toBe(
            fixtureNumber(expected, "face_count"),
        );
        expect(plus.faces({ select: SelectMode.Last }).length, `${expected.name}.last_faces`).toBe(
            fixtureNumber(expected, "last_faces"),
        );
    },
    "fuse/chained-operations": expected => {
        let three = new Box(10, 10, 10)
            .union(standingCylinder(1, 5))
            .union(new Sphere(1).moved(new Pos(5, 0, 0)));
        let last = three.faces({ select: SelectMode.Last });
        expect(last.length, `${expected.name}.count`).toBe(fixtureNumber(expected, "count"));
        expectNames(
            expected,
            "geom_types",
            last.map(face => face.geomType),
        );
    },
    "cut/hole-through-a-box": expected => {
        let holed = new Box(10, 10, 10).subtract(new Cylinder(1, 20));
        expectEverySelect(expected, holed);
        expectNames(
            expected,
            "last_face_types",
            holed.faces({ select: SelectMode.Last }).map(face => face.geomType),
        );
        expectNumbersClose(
            expected,
            "new_edge_lengths",
            holed
                .edges({ select: SelectMode.New })
                .map(edge => edge.length)
                .toSorted((a, b) => a - b),
            MASS_TOLERANCE,
        );
    },
    "cut/half-a-box": expected => {
        let half = new Box(10, 10, 10).subtract(new Box(10, 10, 10).moved(new Pos(0, 0, 5)));
        expectEverySelect(expected, half);
        expectNumbersClose(
            expected,
            "last_face_areas",
            half
                .faces({ select: SelectMode.Last })
                .map(face => face.area)
                .toSorted((a, b) => a - b),
            MASS_TOLERANCE,
        );
    },
    "intersect/overlapping-boxes": expected => {
        let bar = new Box(10, 10, 10).intersect(new Box(30, 2, 2));
        if (bar === undefined) {
            throw new Error(`${expected.name}: the boxes do intersect`);
        }
        expectEverySelect(expected, bar);
    },
    "clean/keeps-the-record": expected => {
        expectEverySelect(expected, Solid.makeBox(1, 1, 1).clean());
    },
    "clean/after-a-fuse": expected => {
        let part = new Box(10, 10, 10).union(standingCylinder(2, 5)).clean();
        expectEverySelect(expected, part);
        expectNames(
            expected,
            "last_face_types",
            part
                .faces({ select: SelectMode.Last })
                .map(face => face.geomType)
                .toSorted(),
        );
    },
    "select/all-is-the-default": expected => {
        let box = new Box(10, 10, 10);
        let fused = box.union(standingCylinder(2, 5));
        expectCounts(expected, "plain", box, SelectMode.All);
        expectCounts(expected, "fused", fused, SelectMode.All);
        expect(
            fused.faces().length === fused.faces({ select: SelectMode.All }).length,
            `${expected.name}.default_matches_all`,
        ).toBe(fixtureValue(expected, "default_matches_all"));
    },
    "select/sub-shapes-of-a-selected-face": expected => {
        let part = new Box(10, 10, 10).union(standingCylinder(2, 5));
        let top = part.faces().sortBy(Axis.Z).last;
        expect(top.edges().length, `${expected.name}.face_edge_count`).toBe(
            fixtureNumber(expected, "face_edge_count"),
        );
        expect(
            () => top.edges({ select: SelectMode.Last }),
            `${expected.name}.face_has_no_record`,
        ).toThrow();
    },
    "errors/no-record": expected => {
        let rectangle = new Rectangle(8, 2);
        expect(
            rectangle.vertices({ select: SelectMode.All }).length,
            `${expected.name}.all_vertices`,
        ).toBe(fixtureNumber(expected, "all_vertices"));
        expect(
            () => rectangle.vertices({ select: SelectMode.Last }),
            `${expected.name}.last_raises`,
        ).toThrow();
        expect(
            () => rectangle.vertices({ select: SelectMode.New }),
            `${expected.name}.new_raises`,
        ).toThrow();
    },
    "fillet/box-vertical-edges": expected => {
        let box = new Box(10, 10, 10);
        let rounded = box.fillet(1, box.edges().filterBy(Axis.Z));
        expectEverySelect(expected, rounded);
        expectNames(
            expected,
            "last_face_types",
            rounded
                .faces({ select: SelectMode.Last })
                .map(face => face.geomType)
                .toSorted(),
        );
        expectNumbersClose(
            expected,
            "new_edge_lengths",
            rounded
                .edges({ select: SelectMode.New })
                .map(edge => edge.length)
                .toSorted((a, b) => a - b),
            MASS_TOLERANCE,
        );
    },
    "chamfer/box-vertical-edges": expected => {
        let box = new Box(10, 10, 10);
        let beveled = box.chamfer(1, box.edges().filterBy(Axis.Z));
        expectEverySelect(expected, beveled);
        expectNumbersClose(
            expected,
            "last_face_areas",
            beveled
                .faces({ select: SelectMode.Last })
                .map(face => face.area)
                .toSorted((a, b) => a - b),
            MASS_TOLERANCE,
        );
    },
    "fillet-2d/face-corners": expected => {
        let face = new Rectangle(6, 4).face();
        expectEverySelect(expected, face.fillet2D(1, face.vertices()));
    },
    "chamfer-2d/face-corners": expected => {
        let face = new Rectangle(6, 4).face();
        let chamfered = face.chamfer2D(1, 1, face.vertices());
        expectEverySelect(expected, chamfered);
        expectNumbersClose(
            expected,
            "last_edge_lengths",
            chamfered
                .edges({ select: SelectMode.Last })
                .map(edge => edge.length)
                .toSorted((a, b) => a - b),
            MASS_TOLERANCE,
        );
    },
    "fillet-2d/closed-wire-corners": expected => {
        let wire = new Rectangle(6, 4).wire();
        let rounded = wire.fillet2D(1, wire.vertices());
        expectEverySelect(expected, rounded);
        expectNames(
            expected,
            "last_edge_types",
            rounded
                .edges({ select: SelectMode.Last })
                .map(edge => edge.geomType)
                .toSorted(),
        );
    },
    "fillet-2d/open-wire-corners": expected => {
        let wire = new Wire([
            Edge.makeLine([0, 0], [4, 0]),
            Edge.makeLine([4, 0], [4, 3]),
            Edge.makeLine([4, 3], [0, 3]),
        ]);
        let corners = wire.vertices().sortBy(Axis.X).slice(-2);
        let rounded = wire.fillet2D(1, corners);
        expectEverySelect(expected, rounded);
        expectNames(
            expected,
            "last_edge_types",
            rounded
                .edges({ select: SelectMode.Last })
                .map(edge => edge.geomType)
                .toSorted(),
        );
    },
    "chamfer-2d/closed-wire-corners": expected => {
        let wire = new Rectangle(6, 4).wire();
        expectEverySelect(expected, wire.chamfer2D(1, 1, wire.vertices()));
    },
    "join/connected-lines": expected => {
        let bent = new Line([0, 0], [1, 0]).union(new Line([1, 0], [1, 1]));
        expectEverySelect(expected, bent);
        expectPoints(
            expected,
            "last_edge_midpoints",
            sortedPoints(bent.edges({ select: SelectMode.Last }).map(edge => edge.positionAt(0.5))),
        );
        expectPoints(
            expected,
            "last_vertices",
            sortedPoints(bent.vertices({ select: SelectMode.Last }).map(vertex => vertex.center())),
        );
    },
    "join/collinear-lines": expected => {
        let straight = new Line([0, 0], [1, 0]).union(new Line([1, 0], [2, 0]));
        expectEverySelect(expected, straight);
        expectPoints(
            expected,
            "last_vertices",
            sortedPoints(
                straight.vertices({ select: SelectMode.Last }).map(vertex => vertex.center()),
            ),
        );
    },
    "join/onto-an-empty-curve": expected => {
        let chain = new Curve().union([
            new Line([0, 0], [1, 0]),
            new Line([1, 0], [1, 1]),
            new Line([1, 1], [0, 1]),
        ]);
        expectEverySelect(expected, chain);
    },
    "join/disjoint-lines": expected => {
        let disjoint = new Line([0, 0], [1, 0]).union(new Line([5, 0], [6, 0]));
        expectEverySelect(expected, disjoint);
        expectPoints(
            expected,
            "last_edge_midpoints",
            sortedPoints(
                disjoint.edges({ select: SelectMode.Last }).map(edge => edge.positionAt(0.5)),
            ),
        );
    },
});
