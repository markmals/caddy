import { expect } from "vite-plus/test";

import type { FixtureCase } from "../../../../../reference/build123d/oracle.ts";
import type { Location } from "../../../src/geometry/index.ts";
import type { OracleCases } from "../oracle/support.ts";

import {
    expectClose,
    expectMatrixClose,
    expectVectorClose,
    fixtureNumber,
    fixtureRecord,
    fixtureValue,
} from "../../../../../reference/build123d/oracle.ts";
import {
    LINEAR_TOLERANCE,
    MASS_TOLERANCE,
    ORIENTATION_TOLERANCE,
} from "../../../../../reference/build123d/tolerances.ts";
import { Axis, Plane } from "../../../src/geometry/index.ts";
import { Edge, Face, Shell, Solid, Wire } from "../../../src/topology/index.ts";
import { expectPoint, expectShapeMetrics } from "../oracle/support.ts";
import {
    coneWall,
    cylinderWall,
    drilledWall,
    frame,
    notchedDisc,
    plateWithHole,
} from "./shapes.ts";

/** The `location` serializer: position, intrinsic XYZ orientation and the 3x4 transform. */
function expectLocation(expected: FixtureCase, key: string, actual: Location): void {
    let record = fixtureRecord(expected, key);
    expectVectorClose(record, "position", actual.position.toTuple(), LINEAR_TOLERANCE);
    expectVectorClose(record, "orientation", actual.orientation.toTuple(), ORIENTATION_TOLERANCE);
    expectMatrixClose(record, "matrix", [actual.transform.toRows().flat()], LINEAR_TOLERANCE);
}

/**
 * An axis has no preferred direction, and the two sides pick opposite ends depending on which
 * candidate direction they test first, so both are compared with a positive leading component.
 */
function canonicalDirection(
    direction: readonly [number, number, number],
): [number, number, number] {
    let leading = direction.find(component => Math.abs(component) > 1e-9) ?? 1;
    let sign = leading < 0 ? -1 : 1;
    return [direction[0] * sign, direction[1] * sign, direction[2] * sign];
}
/** The `_axes` serializer: axis count, sorted directions and each axis' position. */
function expectAxes(expected: FixtureCase, key: string, face: Face): void {
    let record = fixtureRecord(expected, key);
    let axes = face.axesOfSymmetry;
    expect(axes.length, `${expected.name}.${key}.count`).toBe(fixtureNumber(record, "count"));
    let directions = axes
        .map(axis => canonicalDirection(axis.direction.toTuple()))
        .sort(
            (first, second) => first[0] - second[0] || first[1] - second[1] || first[2] - second[2],
        );
    expectMatrixClose(record, "directions", directions, LINEAR_TOLERANCE);
    expectMatrixClose(
        record,
        "positions",
        axes.map(axis => axis.position.toTuple()),
        LINEAR_TOLERANCE,
    );
}

function expectAxisOfRotation(expected: FixtureCase, key: string, face: Face): void {
    let value = fixtureValue(expected, key);
    let axis = face.axisOfRotation;
    if (value === null) {
        expect(axis, `${expected.name}.${key}`).toBeUndefined();
        return;
    }
    if (axis === undefined) throw new Error(`${expected.name}.${key}: expected an axis`);
    let record = fixtureRecord(expected, key);
    expectVectorClose(record, "position", axis.position.toTuple(), LINEAR_TOLERANCE);
    expectVectorClose(record, "direction", axis.direction.toTuple(), LINEAR_TOLERANCE);
}

export const memberCases: OracleCases = {
    "members/make-holes": expected => {
        let plate = Face.makeRect(20, 12);
        let hole = Wire.makeCircle(3, new Plane({ origin: [5, 2, 0] }));
        expectShapeMetrics(expected, "holed", plate.makeHoles([hole]));
        expect(plate.makeHoles([hole]).innerWires).toHaveLength(
            fixtureNumber(expected, "holed_inner_wire_count"),
        );
        let drilled = drilledWall();
        expectClose(expected, "drilled_area", drilled.area, MASS_TOLERANCE);
        expectShapeMetrics(
            expected,
            "reholed",
            drilled.withoutHoles().makeHoles(drilled.innerWires),
        );
    },
    "members/without-holes": expected => {
        let plate = frame();
        let drilled = drilledWall();
        let rect = Face.makeRect(1, 1);
        expectShapeMetrics(expected, "frame", plate);
        expectShapeMetrics(expected, "filled", plate.withoutHoles());
        expectShapeMetrics(expected, "drilled", drilled);
        expectShapeMetrics(expected, "drilled_filled", drilled.withoutHoles());
        expectClose(expected, "frame_area_without_holes", plate.areaWithoutHoles, MASS_TOLERANCE);
        expectClose(
            expected,
            "plate_area_without_holes",
            plateWithHole().areaWithoutHoles,
            MASS_TOLERANCE,
        );
        expect(rect.isSame(rect.withoutHoles())).toBe(fixtureValue(expected, "rect_unchanged"));
    },
    "members/axes-of-symmetry": expected => {
        expectAxes(expected, "square", Face.makeRect(1, 1));
        expectAxes(expected, "rectangle", Face.makeRect(1, 2));
        expectAxes(
            expected,
            "holed",
            Face.makeRect(1, 2).subtract(Face.makeRect(0.4, 0.4).translate([0, 0.25, 0])).faces
                .first,
        );
        expectAxes(
            expected,
            "triangle",
            new Face(
                Wire.makePolygon([
                    [0, 0, 0],
                    [1, 0, 0],
                    [0, 0.5, 0],
                ]),
            ),
        );
        expectAxes(expected, "notched_disc", notchedDisc());
    },
    "members/axis-of-rotation": expected => {
        expectAxisOfRotation(expected, "cylinder", cylinderWall());
        expectAxisOfRotation(expected, "cone", coneWall());
        expectAxisOfRotation(expected, "sphere", Solid.makeSphere(2).faces.first);
        expectAxisOfRotation(expected, "torus", Solid.makeTorus(5, 1).faces.first);
        expectAxisOfRotation(
            expected,
            "revolution",
            Face.revolve(
                Edge.makeSpline([
                    [1, 0, 0],
                    [1.5, 0, 1],
                    [1, 0, 2],
                ]),
                90,
                Axis.Z,
            ),
        );
        expectAxisOfRotation(expected, "plane", Face.makeRect(1, 1));
    },
    "members/center-location": expected => {
        let square = Face.makeRect(1, 1, Plane.XZ);
        let wall = cylinderWall();
        expectLocation(expected, "square", square.centerLocation);
        expectLocation(expected, "wall", wall.centerLocation);
        expectPoint(expected, "wall_center", wall.positionAt(0.5, 0.5));
    },
    "members/geometry": expected => {
        let box = Solid.makeBox(1, 1, 2);
        let triangle = new Face(
            Wire.makePolygon([
                [0, 0, 0],
                [1, 0, 0],
                [0, 1, 0],
            ]),
        );
        expect(box.faces.toSorted(Axis.Z).last.geometry).toBe(fixtureValue(expected, "square"));
        expect(box.faces.toSorted(Axis.Y).last.geometry).toBe(fixtureValue(expected, "rectangle"));
        expect(triangle.geometry).toBe(fixtureValue(expected, "polygon"));
        expect(plateWithHole().geometry ?? null).toBe(fixtureValue(expected, "plate_with_hole"));
        expect(cylinderWall().geometry ?? null).toBe(fixtureValue(expected, "cylinder"));
    },
    "members/location-at": expected => {
        let box = Solid.makeBox(1, 2, 3);
        let bottom = box.faces.toSorted(Axis.Z).first;
        let front = box.faces.toSorted(Axis.X).first;
        let wall = cylinderWall();
        let rect = Face.makeRect(34, 10);
        expectLocation(expected, "bottom", bottom.locationAt(0.5, 0.5));
        expectLocation(expected, "front_x_dir", front.locationAt(0.5, 0.5, { xDir: [0, 0, 1] }));
        expectLocation(expected, "by_point", bottom.locationAt(bottom.positionAt(0, 0)));
        expectLocation(expected, "wall_center", wall.locationAt());
        expectLocation(expected, "wall_uv", wall.locationAt(0, 1));
        expectLocation(expected, "rect", rect.locationAt());
        expectLocation(expected, "rect_flipped", rect.reverseNormal().locationAt());
    },
    "members/shell-location-at": expected => {
        let shell = new Shell(Solid.makeBox(1, 2, 3).faces);
        expectLocation(expected, "side", shell.locationAt([1.2, 1, 1.5]));
        expectLocation(expected, "top_x_dir", shell.locationAt([0.5, 1, 3.1], { xDir: [0, 1, 0] }));
    },
    "members/semi-angle": expected => {
        expectClose(expected, "cone", coneWall().semiAngle!, LINEAR_TOLERANCE);
        expect(cylinderWall().semiAngle ?? null).toBe(fixtureValue(expected, "cylinder"));
        expect(Face.makeRect(1, 1).semiAngle ?? null).toBe(fixtureValue(expected, "plane"));
    },
    "members/uv-face": expected => {
        let plate = plateWithHole();
        expectShapeMetrics(expected, "wall", cylinderWall().uvFace);
        expectShapeMetrics(expected, "plate", plate.uvFace);
        expect(plate.uvFace.innerWires).toHaveLength(
            fixtureNumber(expected, "plate_inner_wire_count"),
        );
    },
};
