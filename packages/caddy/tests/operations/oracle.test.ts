import { expectVectorClose, oracleSuite } from "../../../../reference/build123d/oracle.ts";
import { LINEAR_TOLERANCE } from "../../../../reference/build123d/tolerances.ts";
import { makeWirePolygon } from "../../src/curves/wire-makers.ts";
import { Align, Axis, Plane, Pos } from "../../src/geometry/index.ts";
import {
    Until,
    chamfer,
    draft,
    extrude,
    fillet,
    loft,
    mirror,
    offset,
    project,
    revolve,
    scale,
    section,
    split,
    sweep,
    thicken,
} from "../../src/operations/index.ts";
import { Box } from "../../src/parts/index.ts";
import { Rectangle } from "../../src/sketch/index.ts";
import { Keep } from "../../src/topology/enums.ts";
import { Face, Solid, Vertex } from "../../src/topology/index.ts";
import { expectShapeMetrics } from "../shape-metrics.ts";

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
        expectShapeMetrics(expected, revolve(profile, Axis.Z, 180));
    },
    "loft/ruled": expected => {
        let lower = new Rectangle(10, 8).faces()[0]!;
        let upper = new Rectangle(6, 4).transform(new Pos(0, 0, 8)).faces()[0]!;
        expectShapeMetrics(expected, loft([lower, upper], true));
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
        expectShapeMetrics(expected, split(new Box(8, 6, 4), Plane.XY, Keep.Top)),
    "split/bottom": expected =>
        expectShapeMetrics(expected, split(new Box(8, 6, 4), Plane.XY, Keep.Bottom)),
    "section/plane": expected => expectShapeMetrics(expected, section(new Box(8, 6, 4), Plane.XY)),
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
});
