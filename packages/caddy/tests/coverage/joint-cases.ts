import { expect } from "vite-plus/test";

import type { OracleCases } from "../topology/oracle/support.ts";

import {
    fixtureRecord,
    fixtureString,
    fixtureValue,
} from "../../../../reference/build123d/oracle.ts";
import { Box, Location, Pos, RigidJoint } from "../../src/index.ts";
import { expectLocation } from "../joints/support.ts";
import { expectShapeMetrics } from "../topology/oracle/support.ts";

export const jointCases: OracleCases = {
    "joint/base": expected => {
        // A centred `Box` sits at a non-identity location, so the joint's placement relative to
        // its parent is not the location it was given — which is what `Joint` has to get right.
        let base = new Box(10, 10, 2).solid();
        let arm = new Box(2, 2, 6).solid();
        let socket = new RigidJoint("socket", base, { jointLocation: new Pos(0, 0, 1) });
        let stem = new RigidJoint("stem", arm, { jointLocation: new Pos(0, 0, -3) });

        let before = fixtureRecord(expected, "before");
        expect(socket.label, "label").toBe(fixtureString(before, "label"));
        expect(socket.parent, "parent").toBe(base);
        expect([...base.joints.keys()].sort(), "registry").toEqual(
            fixtureValue(before, "parent_labels"),
        );
        expect(socket.connectedTo, "connected joint").toBeUndefined();
        expect(fixtureValue(before, "connected_to"), "fixture connected joint").toBeNull();
        expectLocation(before, "location", socket.location);

        // build123d relocates `stem`'s parent in place; Caddy returns the relocated copy, whose
        // joints are rebound to it.
        let moved = socket.connectTo(stem);
        let after = fixtureRecord(expected, "after");
        expect(socket.connectedTo?.label, "connected joint").toBe(
            fixtureString(after, "connected_to"),
        );
        expect(socket.connectedTo, "connected joint is the rebound one").toBe(
            moved.joints.get("stem"),
        );
        expectShapeMetrics(after, "moved", moved);
        expectLocation(after, "stem_location", moved.joints.get("stem")!.location);

        let relocated = base.located(Location.fromOrientation([5, 0, 0], [0, 0, 90]));
        expectLocation(expected, "relocated", relocated.joints.get("socket")!.location);
        expectLocation(
            expected,
            "relative_location",
            (relocated.joints.get("socket") as RigidJoint).relativeLocation,
        );
    },
};
