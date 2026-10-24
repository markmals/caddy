import { expect } from "vite-plus/test";

import type { OracleCases } from "../oracle/support.ts";

import { expectClose, fixtureValue } from "../../../../../reference/build123d/oracle.ts";
import { MASS_TOLERANCE } from "../../../../../reference/build123d/tolerances.ts";
import { ContinuityLevel } from "../../../src/curves/index.ts";
import { Axis, Plane, Pos } from "../../../src/geometry/index.ts";
import { Box } from "../../../src/parts/index.ts";
import {
    delta,
    Edge,
    edgesToWires,
    newEdges,
    Solid,
    topoDistanceTo,
    topoExploreCommonVertex,
    topoExploreConnectedEdges,
    Wire,
} from "../../../src/topology/index.ts";
import { expectCount, expectMeasures, expectPoint } from "../oracle/support.ts";
import { expectRows, makeBox, sortedCenters } from "./support.ts";

export const exploreCases: OracleCases = {
    "edges-to-wires/box-face": expected => {
        let face = new Box(2, 3, 4).faces.toSorted(Axis.Z).at(-1)!;
        let wires = edgesToWires(face.edges);
        expectCount(expected, "count", wires.length);
        expectMeasures(
            expected,
            "lengths",
            wires.map(wire => wire.length),
        );
        expect(
            wires.map(wire => wire.isClosed),
            `${expected.name}.closed`,
        ).toEqual(fixtureValue(expected, "closed"));
    },

    "edges-to-wires/two-chains": expected => {
        let chain = [
            Edge.makeLine([0, 0, 0], [1, 0, 0]),
            Edge.makeLine([1, 0, 0], [1, 1, 0]),
            Edge.makeLine([5, 5, 0], [6, 5, 0]),
        ];
        let wires = edgesToWires(chain);
        expectCount(expected, "count", wires.length);
        expectMeasures(
            expected,
            "lengths",
            wires.map(wire => wire.length).sort((a, b) => a - b),
        );
        expect(
            wires.map(wire => wire.edges.length).sort((a, b) => a - b),
            `${expected.name}.edge_counts`,
        ).toEqual(fixtureValue(expected, "edge_counts"));
    },

    "edges-to-wires/tolerance": expected => {
        let gapped = [
            Edge.makeLine([0, 0, 0], [1, 0, 0]),
            Edge.makeLine([1.0005, 0, 0], [2, 0, 0]),
        ];
        expectCount(expected, "default", edgesToWires(gapped).length);
        expectCount(expected, "loose", edgesToWires(gapped, { tolerance: 1e-2 }).length);
    },

    "topo-explore/common-vertex": expected => {
        let face = new Box(2, 2, 2).faces.toSorted(Axis.Z).at(-1)!;
        let edges = face.edges.toSorted(Axis.X);
        let adjacent = topoExploreCommonVertex(edges[0]!, edges[1]!);
        expect(adjacent, `${expected.name}.adjacent`).toBeDefined();
        expectPoint(expected, "adjacent", adjacent!.center);
        expect(
            topoExploreCommonVertex(edges[0]!, edges.at(-1)!) !== undefined,
            `${expected.name}.opposite_found`,
        ).toBe(fixtureValue(expected, "opposite_found"));
    },

    "topo-explore/connected-edges": expected => {
        let box = makeBox(1, 2, 3);
        let edge = box.edges.toSorted(Axis.Z)[0]!;
        let atC0 = topoExploreConnectedEdges(edge, { parent: box });
        expectCount(expected, "c0_count", atC0.length);
        expectRows(expected, "c0_centers", sortedCenters(atC0));
        expectCount(
            expected,
            "c1_count",
            topoExploreConnectedEdges(edge, { parent: box, continuity: ContinuityLevel.C1 }).length,
        );
    },

    "topo-explore/connected-edges-tangent": expected => {
        let wire = new Wire([
            Edge.makeLine([0, 0, 0], [5, 0, 0]),
            Edge.makeTangentArc([5, 0, 0], [1, 0, 0], [8, 3, 0]),
        ]);
        let line = wire.edges.toSorted(Axis.X)[0]!;
        let atC1 = topoExploreConnectedEdges(line, {
            parent: wire,
            continuity: ContinuityLevel.C1,
        });
        expectCount(expected, "c0_count", topoExploreConnectedEdges(line, { parent: wire }).length);
        expectCount(expected, "c1_count", atC1.length);
        expectCount(
            expected,
            "c2_count",
            topoExploreConnectedEdges(line, { parent: wire, continuity: ContinuityLevel.C2 })
                .length,
        );
        expectRows(expected, "c1_centers", sortedCenters(atC1));
    },

    "topo-explore/connected-edges-moved": expected => {
        let box = makeBox(1, 2, 3);
        let moved = box.edges.toSorted(Axis.Z)[0]!.moved(new Pos(10, 0, 0));
        let connected = topoExploreConnectedEdges(moved, { parent: box });
        expectCount(expected, "count", connected.length);
        expectRows(expected, "centers", sortedCenters(connected));
    },

    "topo-distance/box-faces": expected => {
        let box = new Box(2, 2, 2);
        let top = box.faces.toSorted(Axis.Z).at(-1)!;
        let key = topoDistanceTo(top);
        expectMeasures(
            expected,
            "distances",
            box.faces.map(face => key(face)).sort((a, b) => a - b),
        );
        expect(
            [...box.faces.groupBy(topoDistanceTo(top))].map(group => group.length),
            `${expected.name}.grouped`,
        ).toEqual(fixtureValue(expected, "grouped"));
    },

    "topo-distance/box-vertices": expected => {
        let box = new Box(2, 2, 2);
        let corner = box.vertices.toSorted(Axis.X).toSorted(Axis.Y).toSorted(Axis.Z)[0]!;
        let key = topoDistanceTo(corner);
        expectMeasures(
            expected,
            "distances",
            box.vertices.map(vertex => key(vertex)).sort((a, b) => a - b),
        );
    },

    "topo-distance/box-edges": expected => {
        let box = new Box(2, 2, 2);
        let key = topoDistanceTo(box.edges.toSorted(Axis.Z)[0]!);
        expectMeasures(
            expected,
            "distances",
            box.edges.map(edge => key(edge)).sort((a, b) => a - b),
        );
    },

    "topo-distance/two-references": expected => {
        let box = new Box(2, 2, 2);
        let faces = box.faces;
        let key = topoDistanceTo([faces.toSorted(Axis.Z).at(-1)!, faces.toSorted(Axis.Z)[0]!]);
        expectMeasures(
            expected,
            "distances",
            box.faces.map(face => key(face)).sort((a, b) => a - b),
        );
    },

    "new-edges/box-and-cylinder": expected => {
        let box = makeBox(4, 4, 1, [-2, -2, 0]);
        let cylinder = Solid.makeCylinder(1, 3, {
            plane: Plane.XY.withOrigin([0, 0, -1]),
        });
        let combined = box.fuse(cylinder);
        let found = newEdges([box, cylinder], combined);
        expectCount(expected, "count", found.length);
        expectMeasures(
            expected,
            "lengths",
            found.map(edge => edge.length).sort((a, b) => a - b),
        );
        expectRows(expected, "centers", sortedCenters(found));
    },

    "new-edges/unlisted-operand": expected => {
        let first = makeBox(1, 1, 1);
        let combined = first.fuse(makeBox(1, 1, 1).moved(new Pos(2, 0, 0)));
        expectCount(expected, "count", newEdges([first], combined).length);
    },

    "delta/removes-shared-shapes": expected => {
        let cylinder = Solid.makeCylinder(1, 5);
        let sphere = Solid.makeSphere(2);
        let cone = Solid.makeCone(2, 1, 2);
        let left = delta([cylinder, sphere, cone], [sphere, cone]);
        expectCount(expected, "count", left.length);
        expect(left[0] === cylinder, `${expected.name}.is_cylinder`).toBe(
            fixtureValue(expected, "is_cylinder"),
        );
        expectClose(expected, "volume", left[0]!.volume, MASS_TOLERANCE);
        expectCount(expected, "empty", delta([sphere], [sphere]).length);
        expectCount(expected, "all_kept", delta([sphere, cone], []).length);
    },
};
