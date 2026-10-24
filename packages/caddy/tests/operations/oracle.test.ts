import { expect } from "vite-plus/test";

import {
    expectClose,
    expectVectorClose,
    fixtureRecord,
    oracleSuite,
} from "../../../../reference/build123d/oracle.ts";
import { LINEAR_TOLERANCE } from "../../../../reference/build123d/tolerances.ts";
import { makeLine } from "../../src/curves/edge-makers.ts";
import { FilletPolyline } from "../../src/curves/index.ts";
import { makeWirePolygon } from "../../src/curves/wire-makers.ts";
import { Align, Axis, Plane, Pos } from "../../src/geometry/index.ts";
import {
    Transition,
    Until,
    chamfer,
    draft,
    extrude,
    fillet,
    loft,
    makeBrakeFormed,
    mirror,
    offset,
    project,
    projectWorkplane,
    revolve,
    scale,
    section,
    split,
    sweep,
    thicken,
} from "../../src/operations/index.ts";
import { Box, Cylinder, Sphere } from "../../src/parts/index.ts";
import { Kind, Rectangle } from "../../src/sketch/index.ts";
import { Keep } from "../../src/topology/enums.ts";
import { Face, ShapeList, Solid, Vertex, Wire } from "../../src/topology/index.ts";
import { expectShapeMetrics } from "../shape-metrics.ts";

/** build123d's dprism cases cut a unit box that sits on the XY plane. */
function dprismBox(): Solid {
    return new Box(1, 1, 1, { align: [Align.Center, Align.Center, Align.Min] }).solid();
}

function brakeOutline(): Wire {
    return new FilletPolyline(
        [
            [0, 0],
            [5, 6],
            [10, 1],
        ],
        1,
    ).wire();
}

oracleSuite("operations", {
    "extrude/face": expected => expectShapeMetrics(expected, extrude(new Rectangle(8, 5), 6)),
    "extrude/both": expected =>
        expectShapeMetrics(expected, extrude(new Rectangle(8, 5), 3, { both: true })),
    "extrude/taper": expected =>
        expectShapeMetrics(expected, extrude(new Rectangle(10, 6), 5, { taper: 10 })),
    "extrude/until-next": expected => {
        let profile = new Rectangle(4, 3).transform(new Pos(0, 0, -10)).faces()[0]!;
        expectShapeMetrics(
            expected,
            extrude(profile, undefined, { until: Until.Next, target: new Box(10, 8, 10) }),
        );
    },
    "extrude/until-last": expected => {
        let profile = new Rectangle(4, 3).transform(new Pos(0, 0, -10)).faces()[0]!;
        expectShapeMetrics(
            expected,
            extrude(profile, undefined, { until: Until.Last, target: new Box(10, 8, 10) }),
        );
    },
    "extrude/until-previous": expected => {
        let profile = new Rectangle(4, 3).transform(new Pos(0, 0, 10)).faces()[0]!;
        expectShapeMetrics(
            expected,
            extrude(profile, undefined, { until: Until.Previous, target: new Box(10, 8, 10) }),
        );
    },
    "revolve/face": expected => {
        let profile = new Face(
            makeWirePolygon([
                [2, 0, 0],
                [5, 0, 0],
                [5, 0, 4],
                [2, 0, 4],
            ]),
        );
        expectShapeMetrics(expected, revolve(profile, { revolutionArc: 180 }));
    },
    "loft/ruled": expected => {
        let lower = new Rectangle(10, 8).faces()[0]!;
        let upper = new Rectangle(6, 4).transform(new Pos(0, 0, 8)).faces()[0]!;
        expectShapeMetrics(expected, loft([lower, upper], { ruled: true }));
    },
    "loft/smooth": expected => {
        let bottom = new Rectangle(9, 9).faces()[0]!;
        let middle = new Rectangle(7, 7).transform(new Pos(0, 0, 4)).faces()[0]!;
        let top = new Rectangle(4, 4).transform(new Pos(0, 0, 8)).faces()[0]!;
        expectShapeMetrics(expected, loft([bottom, middle, top]));
    },
    "sweep/face": expected => {
        let path = makeWirePolygon(
            [
                [0, 0, 0],
                [0, 0, 5],
                [0, 0, 10],
            ],
            false,
        );
        expectShapeMetrics(expected, sweep(new Rectangle(4, 3).faces()[0]!, path));
    },
    "fillet/solid": expected => {
        let solid = new Box(10, 8, 6);
        expectShapeMetrics(expected, fillet(solid.edges().filterBy(Axis.Z), 1));
    },
    "chamfer/solid": expected => {
        let solid = new Box(10, 8, 6);
        expectShapeMetrics(expected, chamfer(solid.edges().filterBy(Axis.Z), 1));
    },
    "offset/solid": expected => expectShapeMetrics(expected, offset(new Box(8, 6, 4), 1)),
    "offset/opening": expected => {
        let solid = new Box(8, 6, 4);
        let top = solid.faces().sortBy(Axis.Z).last!;
        expectShapeMetrics(expected, offset(solid, -0.8, { openings: [top] }));
    },
    "mirror/plane": expected =>
        expectShapeMetrics(
            expected,
            mirror(new Box(4, 2, 3).transform(new Pos(3, 2, 1)), Plane.XZ),
        ),
    "scale/uniform": expected =>
        expectShapeMetrics(expected, scale(new Box(4, 3, 2), 1.5, [1, 0, 0])),
    "scale/nonuniform": expected =>
        expectShapeMetrics(expected, scale(new Box(4, 3, 2), [2, 1.5, 0.5], [0, 0, 0])),
    "split/top": expected =>
        expectShapeMetrics(expected, split(new Box(8, 6, 4), { bisectBy: Plane.XY })),
    "split/bottom": expected =>
        expectShapeMetrics(
            expected,
            split(new Box(8, 6, 4), { bisectBy: Plane.XY, keep: Keep.Bottom }),
        ),
    "section/plane": expected =>
        expectShapeMetrics(expected, section(new Box(8, 6, 4), { sectionBy: Plane.XY })),
    "thicken/face": expected =>
        expectShapeMetrics(expected, thicken(new Rectangle(8, 6).faces()[0]!, 1)),
    "draft/solid": expected => {
        let solid = new Box(10, 8, 6, { align: [Align.Center, Align.Center, Align.Min] });
        let side = solid.faces().sortBy(Axis.X).last!;
        expectShapeMetrics(expected, draft(side, Plane.XY, 5));
    },
    "extrude/face-method": expected =>
        expectShapeMetrics(expected, new Rectangle(8, 5).faces()[0]!.extrude(6)),
    "extrude/sketch-method": expected =>
        expectShapeMetrics(expected, new Rectangle(8, 5).extrude(6)),
    "extrude/solid-method": expected =>
        expectShapeMetrics(expected, Solid.extrude(new Rectangle(8, 5).faces()[0]!, [0, 0, 6])),
    "fillet/method": expected => {
        let solid = new Box(10, 8, 6);
        expectShapeMetrics(expected, solid.fillet(1, solid.edges().filterBy(Axis.Z)));
    },
    "chamfer/method": expected => {
        let solid = new Box(10, 8, 6);
        expectShapeMetrics(expected, solid.chamfer(1, solid.edges().filterBy(Axis.Z)));
    },
    "offset/method": expected =>
        expectShapeMetrics(expected, new Box(8, 6, 4).solids()[0]!.offset3D(1)),
    "project/face-plane": expected => {
        let face = new Rectangle(4, 3).transform(new Pos(0, 0, 5)).faces()[0]!;
        let projected = project(face, Plane.XY);
        if (Array.isArray(projected)) throw new Error("expected projected sketch");
        expectShapeMetrics(expected, projected);
    },
    "project/point-plane": expected => {
        let projected = project(new Vertex(1, 2, 5), Plane.XY);
        if (!Array.isArray(projected) || projected.length !== 1) {
            throw new Error("expected one projected point");
        }
        expectVectorClose(expected, "point", projected[0]!.toTuple(), LINEAR_TOLERANCE);
    },
    "sweep/multisection": expected => {
        let path = makeLine([0, 0, 0], [0, 0, 10]);
        let lower = new Rectangle(6, 4).faces()[0]!;
        let upper = new Rectangle(3, 2).transform(new Pos(0, 0, 10)).faces()[0]!;
        expectShapeMetrics(expected, sweep([lower, upper], path, { multisection: true }));
    },
    "sweep/transition-right": expected => {
        let path = makeWirePolygon(
            [
                [0, 0, 0],
                [0, 0, 8],
                [6, 0, 8],
            ],
            false,
        );
        expectShapeMetrics(
            expected,
            sweep(new Rectangle(2, 2).faces()[0]!, path, { transition: Transition.Right }),
        );
    },
    "extrude/until-target-face": expected => {
        let profile = new Rectangle(3, 3).transform(new Pos(0, 0, -10)).faces()[0]!;
        expectShapeMetrics(
            expected,
            extrude(profile, undefined, { until: Until.Next, target: new Box(12, 12, 6) }),
        );
    },
    "offset/face": expected =>
        expectShapeMetrics(expected, offset(new Rectangle(8, 6).faces()[0]!, 0.75)),
    "offset/method-face-normal": expected =>
        expectShapeMetrics(expected, new Rectangle(8, 6).faces()[0]!.offset(2.5)),
    "hollow/watertight": expected =>
        expectShapeMetrics(expected, new Box(1, 1, 1).solid().hollow(undefined, -0.1)),
    "hollow/openings": expected => {
        let box = new Box(1, 1, 1).solid();
        let lids = box.faces().filterBy(Axis.Z);
        expectShapeMetrics(expected, box.hollow(lids, 0.1, { kind: Kind.Intersection }));
    },
    "maxfillet/box": expected => {
        let solid = new Box(10, 8, 2).solid();
        expectClose(expected, "radius", solid.maxFillet(solid.edges()), LINEAR_TOLERANCE);
    },
    "dprism/thru-all": expected =>
        expectShapeMetrics(
            expected,
            dprismBox().dprism(Face.makeRect(0.5, 0.5), {
                additive: false,
            }),
        ),
    "dprism/depth": expected =>
        expectShapeMetrics(
            expected,
            dprismBox().dprism(Face.makeRect(0.5, 0.5), {
                depth: 0.5,
                thruAll: false,
                additive: false,
            }),
        ),
    "dprism/wire-bounds": expected =>
        expectShapeMetrics(
            expected,
            dprismBox().dprism(Face.makeRect(0.5, 0.5).outerWire(), { additive: false }),
        ),
    "split/method-top": expected => {
        let pieces = new Box(8, 6, 4).solid().split(Plane.XY, Keep.Top);
        expectShapeMetrics(expected, pieces[0]!);
    },
    "split/method-both": expected => {
        let [top, bottom] = new Box(8, 6, 4).solid().split(Plane.XY, Keep.Both);
        expectShapeMetrics(fixtureRecord(expected, "top"), top[0]!);
        expectShapeMetrics(fixtureRecord(expected, "bottom"), bottom[0]!);
    },
    "split/by-perimeter-inside": expected => {
        let sphere = new Sphere(10).solid();
        let surface = sphere.faces()[0]!;
        let perimeter = Wire.makeCircle(3, new Plane({ origin: [0, 0, 10] }));
        let projected = perimeter.projectToShape(sphere, { direction: [0, 0, -1] })[0]!;
        let inside = surface.splitByPerimeter(projected as Wire, Keep.Inside);
        if (inside === undefined || inside instanceof ShapeList) {
            throw new Error("expected one inside surface");
        }
        expectShapeMetrics(expected, inside);
    },
    "project/wire-to-shape": expected => {
        let target = new Cylinder(5, 10, { align: [Align.Center, Align.Center, Align.Min] });
        let square = new Rectangle(4, 4)
            .faces()[0]!
            .outerWire()
            .moved(new Pos(0, 0, 12));
        let projected = square.projectToShape(target.solid(), { direction: [0, 0, -1] });
        expectShapeMetrics(expected, projected[0]!);
    },
    "project/edge-to-shape": expected => {
        let target = new Cylinder(5, 10, { align: [Align.Center, Align.Center, Align.Min] });
        let line = makeLine([-4, 0, 12], [4, 0, 12]);
        let projected = line.projectToShape(target.solid(), { direction: [0, 0, -1] });
        expectShapeMetrics(expected, projected[0]!);
    },
    "project/line-onto-face": expected => {
        let face = Face.makeRect(20, 20);
        let line = makeLine([-4, -2, 5], [4, 3, 5]);
        let projected = line.project(face, [0, 0, -1]);
        if (projected instanceof ShapeList) throw new Error("expected the closest curve");
        expectShapeMetrics(expected, projected);
    },
    "project/workplane": expected => {
        let workplane = projectWorkplane([1, 2, 3], [1, 0, 0], [0, 0, 1], 10);
        let fixture = fixtureRecord(expected, "plane");
        expectVectorClose(fixture, "origin", workplane.origin.toTuple(), LINEAR_TOLERANCE);
        expectVectorClose(fixture, "x_dir", workplane.xDir.toTuple(), LINEAR_TOLERANCE);
        expectVectorClose(fixture, "y_dir", workplane.yDir.toTuple(), LINEAR_TOLERANCE);
        expectVectorClose(fixture, "z_dir", workplane.zDir.toTuple(), LINEAR_TOLERANCE);
    },
    "brakeformed/constant-width": expected =>
        expectShapeMetrics(expected, makeBrakeFormed(0.5, 1, brakeOutline())),
    "brakeformed/station-widths": expected =>
        expectShapeMetrics(expected, makeBrakeFormed(0.5, [1, 2, 3, 4], brakeOutline())),
    "project/faces-along-path": expected => {
        let target = new Cylinder(10, 20).solid();
        let path = Wire.makeCircle(10);
        let squares = [0, 3, 6].map(
            x => new Rectangle(2, 2).transform(new Pos(x, 0, 0)).faces()[0]!,
        );
        let projected = target.projectFaces(squares, path);
        expect(projected.length, "projected face count").toBe(3);
        for (let index of [0, 1, 2]) {
            expectShapeMetrics(fixtureRecord(expected, `face${index}`), projected[index]!);
        }
    },
    "project/face-to-shape": expected => {
        let target = new Cylinder(10, 20).solid();
        let patch = new Rectangle(6, 4).transform(new Pos(0, 0, 14)).faces()[0]!;
        let projected = patch.projectToShape(target, [0, 0, -1]);
        expect(projected.length, "projected face count").toBe(2);
        for (let index of [0, 1]) {
            expectShapeMetrics(fixtureRecord(expected, `face${index}`), projected[index]!);
        }
    },
});
