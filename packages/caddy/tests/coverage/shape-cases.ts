import { expect } from "vite-plus/test";

import type { FixtureCase } from "../../../../reference/build123d/oracle.ts";
import type { Shape, VectorLike } from "../../src/index.ts";
import type { OracleCases } from "../topology/oracle/support.ts";

import {
    expectClose,
    expectMatrixClose,
    expectVectorClose,
    fixtureBoolean,
    fixtureRecord,
    fixtureString,
    fixtureValue,
} from "../../../../reference/build123d/oracle.ts";
import { LINEAR_TOLERANCE, MASS_TOLERANCE } from "../../../../reference/build123d/tolerances.ts";
import { Axis, Location, Pos } from "../../src/index.ts";
import { Edge, Solid, Vertex } from "../../src/topology/index.ts";

function expectDistance(
    expected: FixtureCase,
    key: string,
    shape: Shape,
    other: Shape | VectorLike,
): void {
    let record = fixtureRecord(expected, key);
    let [distance, mine, theirs] = shape.distanceToWithClosestPoints(other);
    expectClose(record, "distance", distance, MASS_TOLERANCE);
    expectVectorClose(record, "mine", mine.toTuple(), LINEAR_TOLERANCE);
    expectVectorClose(record, "theirs", theirs.toTuple(), LINEAR_TOLERANCE);
}

/** The route a sub-shape was selected by, as the fixture records it. */
function expectProvenance(
    expected: FixtureCase,
    key: string,
    shape: Shape,
    owner: Shape | undefined,
    parent: Shape | undefined,
): void {
    let record = fixtureRecord(expected, key);
    expect(shape.topoOwner, `${key} owner`).toBe(owner);
    expect(shape.topoParent, `${key} parent`).toBe(parent);
    expect(shape.topoOwner?.constructor.name ?? null, `${key} owner class`).toBe(
        fixtureValue(record, "owner"),
    );
    expect(shape.topoParent?.constructor.name ?? null, `${key} parent class`).toBe(
        fixtureValue(record, "parent"),
    );
    expect(
        shape.topoPath.map(step => step.constructor.name),
        `${key} path`,
    ).toEqual(fixtureValue(record, "path"));
}

export const shapeCases: OracleCases = {
    "shape/distance-to-with-closest-points": expected => {
        let apart = Solid.makeSphere(1).located(new Pos(0, 2.1, 0));
        expectDistance(expected, "spheres", apart, Solid.makeSphere(1));
        expectDistance(expected, "point", apart, [0, 0, 0]);
        expectDistance(
            expected,
            "crossing",
            Edge.makeLine([-1, 0, 0], [1, 0, 0]),
            Edge.makeLine([0, -1, 1], [0, 1, 1]),
        );
        expectDistance(
            expected,
            "touching",
            Solid.makeBox(1, 1, 1),
            Solid.makeBox(1, 1, 1).located(new Pos(1, 0, 0)),
        );
    },
    "shape/is-null": expected => {
        let edge = Edge.makeLine([0, 0], [1, 1]);
        expect(edge.constructor.name, "class").toBe(fixtureString(expected, "class_name"));
        expect(edge.isNull, "live").toBe(fixtureBoolean(expected, "live"));
        // build123d empties `wrapped`; Caddy releases the native shape, which is the same state.
        edge[Symbol.dispose]();
        expect(edge.isNull, "emptied").toBe(fixtureBoolean(expected, "emptied"));
    },
    "shape/topo-owner-and-parent": expected => {
        let box = Solid.makeBox(1, 1, 1);
        let face = box.faces.toSorted(Axis.X).at(-1)!;
        let edge = face.edges.toSorted(Axis.Y)[0]!;
        let vertex = edge.vertices[0]!;
        expectProvenance(expected, "box", box, undefined, undefined);
        expectProvenance(expected, "face", face, box, box);
        expectProvenance(expected, "edge", edge, face, box);
        expectProvenance(expected, "vertex", vertex, edge, box);
        expect(box.topoOwner === undefined, "top-level owner").toBe(
            fixtureBoolean(expected, "top_level_owner_is_none"),
        );
        expect(box.topoParent === undefined, "top-level parent").toBe(
            fixtureBoolean(expected, "top_level_parent_is_none"),
        );
    },
    "vertex/to-array": expected => {
        expectVectorClose(expected, "single", new Vertex(1, 2, 3).toArray(), LINEAR_TOLERANCE);
        let moved = Solid.makeBox(1, 2, 3).located(Location.fromOrientation([1, 1, 1], [0, 0, 45]));
        expectMatrixClose(
            expected,
            "box",
            moved.vertices
                .map(vertex => vertex.toArray())
                .sort(
                    (left, right) => left[0] - right[0] || left[1] - right[1] || left[2] - right[2],
                ),
            LINEAR_TOLERANCE,
        );
    },
};
