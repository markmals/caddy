import { primitives } from "@roonieone/occt-native";

import type { Shape } from "../../../src/topology/index.ts";
import type { OracleCases } from "./support.ts";

import { Axis, Pos } from "../../../src/geometry/index.ts";
import { GeomType, Solid } from "../../../src/topology/index.ts";
import { box, cylinder, sphere } from "./shapes.ts";
import {
    expectCount,
    expectFlagList,
    expectMeasures,
    expectName,
    expectNames,
    expectPoints,
} from "./support.ts";

/** A box with a rectangular pocket milled into its top face. */
function pocket(): Shape {
    return box().subtract(new Solid(primitives.makeBox(4, 2, 2)).moved(new Pos(3, 2, 2)));
}

function convexities(shapes: Iterable<Shape>): string[] {
    return Array.from(shapes, shape => shape.convexity);
}

export const convexityCases: OracleCases = {
    "convexity/box-edges": expected => {
        let edges = box().edges().sortBy(Axis.Z);
        expectNames(expected, "kinds", convexities(edges));
        expectFlagList(
            expected,
            "interior",
            edges.map(edge => edge.isInterior),
        );
    },
    "convexity/pocket-edges": expected => {
        let edges = [...pocket().edges()];
        let concave = edges
            .filter(edge => edge.convexity === "CONCAVE")
            .sort((first, second) => first.center().x - second.center().x);
        expectCount(expected, "convex", edges.filter(edge => edge.convexity === "CONVEX").length);
        expectCount(expected, "concave", concave.length);
        expectPoints(
            expected,
            "concave_centers",
            concave.map(edge => edge.center()),
        );
    },
    "convexity/cylinder-edges": expected => {
        let solid = cylinder();
        expectNames(expected, "kinds", convexities(solid.edges()).sort());
        expectCount(
            expected,
            "seam_count",
            solid.faces().filterBy(GeomType.Cylinder)[0]!.seams.length,
        );
    },
    "convexity/faces": expected => {
        let side = cylinder().faces().filterBy(GeomType.Cylinder)[0]!;
        let drilled = box().subtract(
            new Solid(primitives.makeCylinder(1, 4)).moved(new Pos(5, 3, 0)),
        );
        expectName(expected, "box_face", box().faces()[0]!.convexity);
        expectName(expected, "cylinder_side", side.convexity);
        expectName(expected, "sphere", sphere().faces()[0]!.convexity);
        expectName(
            expected,
            "hole_side",
            drilled.faces().filterBy(GeomType.Cylinder)[0]!.convexity,
        );
        expectName(expected, "pocket_bottom", pocket().faces().sortBy(Axis.Z)[0]!.convexity);
        expectFlagList(expected, "cylinder_circular", [
            side.isCircularConvex,
            side.isCircularConcave,
        ]);
    },
    "convexity/vertices": expected => {
        expectNames(
            expected,
            "face_corners",
            convexities(box().faces().sortBy(Axis.Z)[0]!.vertices()).sort(),
        );
        expectNames(expected, "solid_corners", convexities(box().vertices()).sort());
        expectNames(expected, "pocket_corners", convexities(pocket().vertices()).sort());
    },
    "face/seams": expected => {
        let seams = cylinder().faces().filterBy(GeomType.Cylinder)[0]!.seams;
        expectCount(expected, "cylinder", seams.length);
        expectMeasures(
            expected,
            "cylinder_lengths",
            seams.map(seam => seam.length),
        );
        expectCount(expected, "box", box().faces()[0]!.seams.length);
    },
};
