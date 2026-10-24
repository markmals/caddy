import type { OracleCases } from "./support.ts";

import { expectClose } from "../../../../../reference/build123d/oracle.ts";
import { MASS_TOLERANCE } from "../../../../../reference/build123d/tolerances.ts";
import { axisEdge } from "../../../src/curves/constrained.ts";
import { Axis, Plane } from "../../../src/geometry/index.ts";
import { Edge, Face, Shell, Solid } from "../../../src/topology/index.ts";
import { box } from "./shapes.ts";
import { expectCount, expectFlags, expectName, expectPoint } from "./support.ts";

export const constructCases: OracleCases = {
    "construct/face-from-plane": expected => {
        let face = new Face(Plane.XZ);
        expectName(expected, "geom_type", face.geomType);
        expectPoint(expected, "normal", face.normalAt());
        expectFlags(expected, { infinite: face.boundingBox.diagonal > 1e6 });
    },
    "construct/shell-from-faces": expected => {
        let solid = box();
        let shell = new Shell(solid.faces);
        let single = new Shell(solid.faces[0]!);
        expectName(expected, "class", shell.constructor.name);
        expectClose(expected, "area", shell.area, MASS_TOLERANCE);
        expectCount(expected, "face_count", shell.faces.length);
        expectFlags(expected, { is_manifold: shell.isManifold });
        expectName(expected, "single_face_class", single.constructor.name);
        expectClose(expected, "single_face_area", single.area, MASS_TOLERANCE);
    },
    "construct/solid-from-shell": expected => {
        let solid = new Solid(new Shell(box().faces));
        expectName(expected, "class", solid.constructor.name);
        expectClose(expected, "volume", solid.volume, MASS_TOLERANCE);
        expectPoint(expected, "center", solid.center);
        expectFlags(expected, { is_valid: solid.isValid });
    },
    "edge/reversed": expected => {
        let edge = Edge.makeCircle(4, { startAngle: 0, endAngle: 90 });
        let flipped = edge.reversed();
        let rebuilt = edge.reversed({ reconstruct: true });
        expectPoint(expected, "start", edge.positionAt(0));
        expectPoint(expected, "flipped_start", flipped.positionAt(0));
        expectPoint(expected, "flipped_end", flipped.positionAt(1));
        expectPoint(expected, "rebuilt_start", rebuilt.positionAt(0));
        expectPoint(expected, "rebuilt_end", rebuilt.positionAt(1));
        expectClose(expected, "rebuilt_length", rebuilt.length, MASS_TOLERANCE);
        expectFlags(expected, {
            flipped_forward: flipped.isForward,
            rebuilt_forward: rebuilt.isForward,
        });
    },
    "edge/geom-equal": expected => {
        let line = Edge.makeLine([0, 0, 0], [10, 0, 0]);
        let circle = Edge.makeCircle(4);
        let spline = Edge.makeSpline([
            [0, 0, 0],
            [5, 2, 0],
            [10, 0, 0],
        ]);
        expectFlags(expected, {
            line_same: line.geomEqual(Edge.makeLine([0, 0, 0], [10, 0, 0])),
            line_other: line.geomEqual(Edge.makeLine([0, 0, 0], [10, 1, 0])),
            line_vs_circle: line.geomEqual(circle),
            circle_same: circle.geomEqual(Edge.makeCircle(4)),
            circle_bigger: circle.geomEqual(Edge.makeCircle(5)),
            circle_tilted: circle.geomEqual(Edge.makeCircle(4, { plane: Plane.XZ })),
            spline_same: spline.geomEqual(
                Edge.makeSpline([
                    [0, 0, 0],
                    [5, 2, 0],
                    [10, 0, 0],
                ]),
            ),
            spline_other: spline.geomEqual(
                Edge.makeSpline([
                    [0, 0, 0],
                    [5, 3, 0],
                    [10, 0, 0],
                ]),
            ),
        });
    },
    "edge/infinite": expected => {
        let finite = Edge.makeLine([0, 0, 0], [10, 0, 0]);
        let infinite = axisEdge(new Axis([1, 2, 0], [1, 0, 0]));
        let trimmed = infinite.trimInfinite(5);
        expectClose(expected, "trimmed_length", trimmed.length, MASS_TOLERANCE);
        expectPoint(expected, "trimmed_start", trimmed.positionAt(0));
        expectPoint(expected, "trimmed_end", trimmed.positionAt(1));
        expectFlags(expected, {
            finite: finite.isInfinite,
            infinite: infinite.isInfinite,
            finite_unchanged: finite.trimInfinite(5) === finite,
        });
    },
};
