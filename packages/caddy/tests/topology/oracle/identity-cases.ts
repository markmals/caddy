import type { OracleCases } from "./support.ts";

import { expectClose } from "../../../../../reference/build123d/oracle.ts";
import { MASS_TOLERANCE } from "../../../../../reference/build123d/tolerances.ts";
import { Pos } from "../../../src/geometry/index.ts";
import { Edge } from "../../../src/topology/index.ts";
import { box } from "./shapes.ts";
import { expectFlags, expectPoint } from "./support.ts";

export const identityCases: OracleCases = {
    "identity/relations": expected => {
        let solid = box();
        let first = solid.faces().first;
        let again = solid.faces().first;
        let moved = solid.moved(new Pos(1, 0, 0));
        let twin = box();
        expectFlags(expected, {
            same_self: solid.isSame(solid),
            equal_self: solid.isEqual(solid),
            same_refetched_face: first.isSame(again),
            equal_refetched_face: first.isEqual(again),
            hash_refetched_face: first.hashCode() === again.hashCode(),
            same_moved: moved.isSame(solid),
            hash_moved: moved.hashCode() === solid.hashCode(),
            same_twin: twin.isSame(solid),
            equality_operator: first.equals(again),
            same_face_from_shell: solid.shells().first.faces().first.isSame(first),
        });
    },
    "identity/reversed": expected => {
        let edge = Edge.makeLine([0, 0, 0], [10, 0, 0]);
        let backwards = edge.reversed();
        expectFlags(expected, {
            same: backwards.isSame(edge),
            equal: backwards.isEqual(edge),
            hash: backwards.hashCode() === edge.hashCode(),
            is_forward: backwards.isForward,
        });
        expectPoint(expected, "start", backwards.positionAt(0));
        expectPoint(expected, "end", backwards.positionAt(1));
        expectClose(expected, "length", backwards.length, MASS_TOLERANCE);
    },
};
