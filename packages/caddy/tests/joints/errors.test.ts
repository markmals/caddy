import { describe, expect, test } from "vite-plus/test";

import type { Joint } from "../../src/index.ts";

import {
    Axis,
    BallJoint,
    Box,
    Cylinder,
    CylindricalJoint,
    GeometryError,
    LinearJoint,
    Location,
    Pos,
    RevoluteJoint,
    RigidJoint,
} from "../../src/index.ts";

/** What a JavaScript caller can pass where a joint is expected; TypeScript rules it out. */
function notAJoint(): Joint {
    return new Box(1, 1, 1) as unknown as Joint;
}

describe("joint binding", () => {
    test("a joint registers itself on its part under its label", () => {
        let part = new Box(1, 1, 1);
        let joint = new RigidJoint("top", part, { jointLocation: new Pos(0, 0, 0.5) });
        expect(part.joints.get("top")).toBe(joint);
        expect(joint.parent).toBe(part);
    });

    test("the last joint to use a label is the one bound to it", () => {
        let part = new Box(1, 1, 1);
        new RigidJoint("hinge", part);
        let second = new RevoluteJoint("hinge", part);
        expect([...part.joints.keys()]).toEqual(["hinge"]);
        expect(part.joints.get("hinge")).toBe(second);
    });

    test("a copy of the part carries rebound copies of its joints", () => {
        let part = new Box(2, 2, 2);
        let joint = new RigidJoint("top", part, { jointLocation: new Pos(0, 0, 1) });
        let moved = part.moved(new Pos(1, 0, 0));
        let carried = moved.joints.get("top");
        expect(carried).toBeInstanceOf(RigidJoint);
        expect(carried).not.toBe(joint);
        expect(carried!.parent).toBe(moved);
        expect(carried!.location.position.toTuple()).toEqual([1, 0, 1]);
        expect(joint.location.position.toTuple()).toEqual([0, 0, 1]);
    });
});

describe("joint pairing", () => {
    test("connecting to something that is not a joint is a TypeError", () => {
        let joint = new RigidJoint("one", new Box(1, 1, 1));
        expect(() => joint.connectTo(notAJoint())).toThrow(TypeError);
        expect(() => joint.relativeTo(notAJoint())).toThrow(TypeError);
    });

    test("a revolute joint only connects to a rigid joint", () => {
        let hinge = new RevoluteJoint("top", new Cylinder(1, 1), { axis: Axis.Z });
        let other = new RevoluteJoint("bottom", new Cylinder(1, 1), { axis: Axis.Z });
        expect(() => hinge.connectTo(other, { angle: 0 })).toThrow(TypeError);
    });

    test("a linear joint connects to rigid and revolute joints only", () => {
        let slider = new LinearJoint("slot", new Box(1, 1, 1), { linearRange: [0, 1] });
        let ball = new BallJoint("ball", new Box(1, 1, 1));
        expect(() => slider.connectTo(ball, { position: 0.5 })).toThrow(TypeError);
    });

    test("a cylindrical joint only connects to a rigid joint", () => {
        let screw = new CylindricalJoint("base", new Box(1, 1, 1), { linearRange: [0, 1] });
        let ball = new BallJoint("ball", new Box(1, 1, 1));
        expect(() => screw.connectTo(ball, { position: 0.5, angle: 0 })).toThrow(TypeError);
    });

    test("a ball joint only connects to a rigid joint", () => {
        let ball = new BallJoint("ball", new Box(1, 1, 1));
        let hinge = new RevoluteJoint("hinge", new Box(1, 1, 1));
        expect(() => ball.connectTo(hinge, { angles: [0, 0, 0] })).toThrow(TypeError);
    });
});

describe("joint limits", () => {
    test("an angle outside the angular range is rejected", () => {
        let hinge = new RevoluteJoint("top", new Cylinder(1, 1), {
            axis: Axis.Z,
            angularRange: [0, 180],
        });
        let arm = new RigidJoint("bottom", new Box(1, 0.5, 1), {
            jointLocation: new Pos(0.5, 0.25, 0),
        });
        expect(() => hinge.connectTo(arm, { angle: 270 })).toThrow(GeometryError);
    });

    test("a position outside the linear range is rejected", () => {
        let slider = new LinearJoint("top", new Box(1, 1, 1), {
            axis: new Axis([0, 0.5, 1], [1, 0, 0]),
            linearRange: [0, 1],
        });
        let rigid = new RigidJoint("bottom", new Box(1, 1, 1), {
            jointLocation: Location.IDENTITY,
        });
        expect(() => slider.connectTo(rigid, { position: 5 })).toThrow(GeometryError);
    });

    test("a cylindrical joint checks both of its ranges", () => {
        let screw = new CylindricalJoint("base", new Box(1, 1, 1), {
            axis: new Axis([0, 0, 1], [0, 0, -1]),
            linearRange: [0, 1],
            angularRange: [0, 90],
        });
        let rigid = new RigidJoint("bottom", new Cylinder(1, 1), {
            jointLocation: new Pos(0.5, 0.25, 0),
        });
        expect(() => screw.connectTo(rigid, { position: 0.5, angle: 270 })).toThrow(GeometryError);
        expect(() => screw.connectTo(rigid, { position: 4, angle: 30 })).toThrow(GeometryError);
    });

    test("gimbal angles outside any of the three ranges are rejected", () => {
        let ball = new BallJoint("socket", new Box(1, 1, 1), {
            jointLocation: new Pos(0.5, 0.5, 1),
            angularRange: [
                [-45, 45],
                [-45, 45],
                [0, 360],
            ],
        });
        let rod = new RigidJoint("ball", new Box(0.3, 0.3, 2), {
            jointLocation: Location.fromOrientation([0, 0, 2], [180, 0, 0]),
        });
        expect(() => ball.connectTo(rod, { angles: [90, 45, 0] })).toThrow(GeometryError);
    });

    test("an angle reference has to be normal to the axis", () => {
        expect(
            () =>
                new RevoluteJoint("top", new Cylinder(1, 1), {
                    axis: new Axis([0, 0, 1], [0, 0, 1]),
                    angleReference: [1, 0, 1],
                }),
        ).toThrow(GeometryError);
        expect(
            () =>
                new CylindricalJoint("base", new Box(1, 1, 1), {
                    axis: new Axis([0, 0, 1], [0, 0, -1]),
                    angleReference: [1, 0, 1],
                    linearRange: [0, 1],
                }),
        ).toThrow(GeometryError);
    });
});
