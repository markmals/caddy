import { primitives } from "@roonieone/occt-native";

import type { OracleCases } from "./support.ts";

import { expectClose } from "../../../../../reference/build123d/oracle.ts";
import { LINEAR_TOLERANCE } from "../../../../../reference/build123d/tolerances.ts";
import { Plane, Pos, Vector } from "../../../src/geometry/index.ts";
import { Rectangle } from "../../../src/sketch/index.ts";
import { Edge, Part, Sketch, Solid } from "../../../src/topology/index.ts";
import { expectCount, expectFlags, expectName, expectPoint } from "./support.ts";

export const compositeCases: OracleCases = {
    "composite/split-and-disjoint": expected => {
        let bar = new Part([new Solid(primitives.makeBox(10, 2, 2))]);
        let splitPart = bar.subtract(
            new Solid(primitives.makeBox(1, 5, 5)).moved(new Pos(4.5, -1, -1)),
        );
        let unit = () => new Solid(primitives.makeBox(1, 1, 1));
        let disjointSum = new Part([unit()]).union(unit().moved(new Pos(5, 0, 0)));
        let joinedSum = new Part([unit()]).union(unit().moved(new Pos(0.5, 0, 0)));
        let splitSketch = new Sketch(new Rectangle(10, 2).faces()).subtract(
            new Rectangle(1, 5).moved(new Pos(4.5, 0, 0)),
        );
        expectName(expected, "split_part_class", splitPart.constructor.name);
        expectCount(expected, "split_part_solids", splitPart.solids().length);
        expectName(expected, "disjoint_sum_class", disjointSum.constructor.name);
        expectCount(expected, "disjoint_sum_solids", disjointSum.solids().length);
        expectName(expected, "joined_sum_class", joinedSum.constructor.name);
        expectCount(expected, "joined_sum_solids", joinedSum.solids().length);
        expectName(expected, "split_sketch_class", splitSketch.constructor.name);
        expectCount(expected, "split_sketch_faces", splitSketch.faces().length);
    },
    "wire/common-plane": expected => {
        let flat = [
            Edge.makeLine([0, 0, 0], [10, 0, 0]),
            Edge.makeLine([10, 0, 0], [10, 5, 0]),
            Edge.makeLine([0, 5, 0], [0, 0, 0]),
        ] as [Edge, Edge, Edge];
        let common = flat[0].commonPlane(flat[1], flat[2]);
        if (common === undefined) throw new Error("expected a common plane");
        expectPoint(expected, "common_origin", common.origin);
        expectPoint(expected, "common_normal", common.zDir);

        let skew = flat[0].commonPlane(Edge.makeLine([0, 0, 0], [0, 5, 5]), flat[1]);
        expectFlags(expected, { skew_is_none: skew === undefined });

        let colinear = flat[0].commonPlane(Edge.makeLine([20, 0, 0], [30, 0, 0]));
        if (colinear === undefined) throw new Error("expected a plane through coaxial lines");
        expectClose(
            expected,
            "colinear_normal_dot_z",
            Math.abs(colinear.zDir.dot(new Vector(0, 0, 1))),
            LINEAR_TOLERANCE,
        );

        let curved = Edge.makeCircle(4, { plane: Plane.XZ }).commonPlane(
            Edge.makeLine([-4, 0, 0], [4, 0, 0]),
        );
        if (curved === undefined) throw new Error("expected a plane through the arc");
        expectPoint(expected, "curved_normal", curved.zDir);

        let alone = flat[0].commonPlane();
        if (alone === undefined) throw new Error("expected a plane through one line");
        expectPoint(expected, "self_only_normal", alone.zDir);

        // Every triple of the four sampled points spans the same area here, so the sign of the
        // normal is arbitrary in both libraries; only the plane is compared.
        let crossing = flat[0].commonPlane(Edge.makeLine([5, -5, 0], [5, 5, 0]));
        if (crossing === undefined) throw new Error("expected a plane through crossing lines");
        expectPoint(expected, "crossing_origin", crossing.origin);
        expectClose(
            expected,
            "crossing_normal_dot_z",
            Math.abs(crossing.zDir.dot(new Vector(0, 0, 1))),
            LINEAR_TOLERANCE,
        );
    },
};
