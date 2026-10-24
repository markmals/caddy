import { expect } from "vite-plus/test";

import {
    expectClose,
    expectVectorClose,
    fixtureNumber,
    fixtureValue,
    oracleSuite,
} from "../../../../reference/build123d/oracle.ts";
import { LINEAR_TOLERANCE, MASS_TOLERANCE } from "../../../../reference/build123d/tolerances.ts";
import {
    Align,
    Axis,
    BallJoint,
    Box,
    Cone,
    Cylinder,
    CylindricalJoint,
    LinearJoint,
    Location,
    Pos,
    RevoluteJoint,
    RigidJoint,
    Rotation,
    Sphere,
} from "../../src/index.ts";
import { cornerBox, expectLocation, expectPlacement } from "./support.ts";

oracleSuite("joints", {
    "rigid/stacked-boxes": expected => {
        let base = cornerBox(1, 1, 1);
        let top = cornerBox(1, 1, 1);
        let baseJoint = new RigidJoint("top", base, { jointLocation: new Pos(0.5, 0.5, 1) });
        let topJoint = new RigidJoint("bottom", top, { jointLocation: new Pos(0.5, 0.5, 0) });
        let moved = baseJoint.connectTo(topJoint);
        expectPlacement(expected, "moved", moved);
        expectPlacement(expected, "base", base);
        expectLocation(expected, "moved_joint", baseJoint.connectedTo!.location);
        expectLocation(expected, "base_joint", baseJoint.location);
    },

    "rigid/order": expected => {
        let forwardBase = new Box(1, 1, 1);
        let forwardMoved = new RigidJoint("one", forwardBase, {
            jointLocation: new Pos(1, 2, 3),
        }).connectTo(new RigidJoint("two", new Sphere(0.5)));
        let reverseBase = new Box(1, 1, 1);
        let reverseJoint = new RigidJoint("one", reverseBase, { jointLocation: new Pos(1, 2, 3) });
        let reverseMoved = new Sphere(0.5);
        let movedBase = new RigidJoint("two", reverseMoved).connectTo(reverseJoint);
        expectVectorClose(
            expected,
            "forward_base",
            forwardBase.location.position.toTuple(),
            LINEAR_TOLERANCE,
        );
        expectVectorClose(
            expected,
            "forward_moved",
            forwardMoved.location.position.toTuple(),
            LINEAR_TOLERANCE,
        );
        expectVectorClose(
            expected,
            "reverse_moved",
            reverseMoved.location.position.toTuple(),
            LINEAR_TOLERANCE,
        );
        expectVectorClose(
            expected,
            "reverse_base",
            movedBase.location.position.toTuple(),
            LINEAR_TOLERANCE,
        );
    },

    "rigid/follows-relocated-part": expected => {
        let part = new Box(2, 2, 2);
        let joint = new RigidJoint("top", part, { jointLocation: new Pos(0, 0, 1) });
        expectLocation(expected, "before", joint.location);
        let relocated = part.located(Location.fromOrientation([5, -1, 2], [0, 0, 45]));
        expectLocation(expected, "after", relocated.joints.get("top")!.location);
        expectLocation(expected, "relative", joint.relativeLocation);
    },

    "rigid/survives-boolean": expected => {
        let part = new Box(2, 2, 2);
        new RigidJoint("top", part, { jointLocation: new Pos(0, 0, 1) });
        let cut = part.subtract(new Cylinder(0.5, 4));
        expect([...cut.joints.keys()].sort()).toEqual(fixtureValue(expected, "labels"));
        expectLocation(expected, "joint", cut.joints.get("top")!.location);
        expectClose(expected, "volume", cut.volume, MASS_TOLERANCE);
    },

    "revolute/angle-reference": expected => {
        let base = new Cylinder(1, 1);
        let arm = cornerBox(1, 0.5, 1);
        let hinge = new RevoluteJoint("top", base, {
            axis: new Axis([0, 0, 1], [0, 0, 1]),
            angleReference: [1, 0, 0],
            angularRange: [0, 180],
        });
        let rigid = new RigidJoint("bottom", arm, { jointLocation: new Pos(0.5, 0.25, 0) });
        let moved = hinge.connectTo(rigid, { angle: 90 });
        expectPlacement(expected, "moved", moved);
        expectLocation(expected, "moved_joint", hinge.connectedTo!.location);
        expectLocation(expected, "hinge_joint", hinge.location);
        expect(hinge.symbol.edges().length).toBe(fixtureNumber(expected, "symbol_edges"));
    },

    "revolute/measured-from-reference": expected => {
        let hinge = new RevoluteJoint("j1", new Box(1, 1, 1), {
            axis: Axis.Z,
            angleReference: [1, 1, 0],
        });
        let moved = hinge.connectTo(
            new RigidJoint("j2", new Box(0.2, 0.2, 2), { jointLocation: Location.IDENTITY }),
            { angle: 22.5 },
        );
        expectPlacement(expected, "moved", moved);
    },

    "revolute/non-z-axis": expected => {
        let base = new Box(6, 4, 2);
        let hinge = new RevoluteJoint("j1", base, { axis: new Axis([3, 0, 1], [0, -1, 0]) });
        let rigid = new RigidJoint("j2", new Cone(2, 1, 2), {
            jointLocation: Location.fromOrientation([-2, 0, -1], [90, 0, -90]),
        });
        let moved = hinge.connectTo(rigid, { angle: 30 });
        expectPlacement(expected, "base", base);
        expectPlacement(expected, "moved", moved);
        expectLocation(expected, "hinge_joint", hinge.location);
        expectLocation(expected, "moved_joint", hinge.connectedTo!.location);
        expect(hinge.angle).toBe(fixtureNumber(expected, "angle"));
    },

    "revolute/default-angle-reference": expected => {
        let aboutZ = new RevoluteJoint("z", new Cylinder(1, 1), {
            axis: new Axis([0, 0, 1], [0, 0, 1]),
        });
        let aboutX = new RevoluteJoint("x", new Cylinder(1, 1), {
            axis: new Axis([0, 0, 0], [1, 0, 0]),
        });
        expectVectorClose(
            expected,
            "z_reference",
            aboutZ.angleReference.toTuple(),
            LINEAR_TOLERANCE,
        );
        expectVectorClose(
            expected,
            "x_reference",
            aboutX.angleReference.toTuple(),
            LINEAR_TOLERANCE,
        );
    },

    "revolute/absolute-locations": expected => {
        let rigid = new RigidJoint("j1", new Box(10, 10, 1), {
            jointLocation: new Pos(-4, -4, 0.5),
        });
        let hinge = new RevoluteJoint("j2", new Box(5, 5, 1), {
            axis: new Axis([2.5, 2.5, 0], [0, -1, 0]),
        });
        let moved = rigid.connectTo(hinge, { angle: 0 });
        expectLocation(expected, "driving", rigid.location);
        expectLocation(expected, "driven", rigid.connectedTo!.location);
        expectPlacement(expected, "moved", moved);
    },

    "linear/rigid": expected => {
        let base = cornerBox(1, 1, 1);
        let slider = new LinearJoint("top", base, {
            axis: new Axis([0, 0.5, 1], [1, 0, 0]),
            linearRange: [0, 1],
        });
        let rigid = new RigidJoint("bottom", cornerBox(1, 1, 1), {
            jointLocation: new Pos(0.5, 0.5, 0),
        });
        let moved = slider.connectTo(rigid, { position: 0.25 });
        expectPlacement(expected, "moved", moved);
        expectLocation(expected, "moved_joint", slider.connectedTo!.location);
        expectLocation(expected, "slider_joint", slider.location);
        expectClose(expected, "position", slider.position!, LINEAR_TOLERANCE);
        expectClose(expected, "angle", slider.angle!, LINEAR_TOLERANCE);
        expect(slider.symbol.edges().length).toBe(fixtureNumber(expected, "symbol_edges"));
    },

    "linear/revolute": expected => {
        let slider = new LinearJoint("top", cornerBox(1, 1, 1), {
            axis: new Axis([0, 0.5, 1], [1, 0, 0]),
            linearRange: [0, 1],
        });
        let hinge = new RevoluteJoint(
            "top",
            cornerBox(1, 0.5, 1).located(new Pos(-0.5, -0.25, 0)),
            {
                axis: new Axis([0, 0, 0], [0, 0, 1]),
                angleReference: [1, 0, 0],
                angularRange: [0, 180],
            },
        );
        let moved = slider.connectTo(hinge, { position: 0.25, angle: 90 });
        expectPlacement(expected, "moved", moved);
        expectLocation(expected, "moved_joint", slider.connectedTo!.location);
        expectClose(expected, "position", slider.position!, LINEAR_TOLERANCE);
        expectClose(expected, "angle", slider.angle!, LINEAR_TOLERANCE);
    },

    "linear/default-position": expected => {
        let slider = new LinearJoint("slot", new Box(4, 4, 1), {
            axis: new Axis([0, 0, 0.5], [1, 0, 0]),
            linearRange: [1, 3],
        });
        let moved = slider.connectTo(
            new RigidJoint("pin", new Box(1, 1, 1), { jointLocation: new Pos(0, 0, -0.5) }),
        );
        expectPlacement(expected, "moved", moved);
        expectClose(expected, "position", slider.position!, LINEAR_TOLERANCE);
    },

    "cylindrical/screwed-dowel": expected => {
        let base = new Box(1, 1, 1, { align: [Align.Center, Align.Center, Align.Min] });
        let dowel = new Cylinder(0.3, 1, { align: [Align.Center, Align.Center, Align.Min] });
        let screw = new CylindricalJoint("base", base, {
            axis: new Axis([0, 0, 1], [0, 0, -1]),
            angleReference: [1, 0, 0],
            linearRange: [0, 1],
            angularRange: [0, 90],
        });
        let rigid = new RigidJoint("bottom", dowel, { jointLocation: Location.IDENTITY });
        let moved = screw.connectTo(rigid, { position: 0.25, angle: 90 });
        expectPlacement(expected, "moved", moved);
        expectLocation(expected, "moved_joint", screw.connectedTo!.location);
        expectLocation(expected, "screw_joint", screw.location);
        expectClose(expected, "position", screw.position!, LINEAR_TOLERANCE);
        expectClose(expected, "angle", screw.angle!, LINEAR_TOLERANCE);
        expect(screw.symbol.edges().length).toBe(fixtureNumber(expected, "symbol_edges"));
    },

    "cylindrical/default-position-and-angle": expected => {
        let screw = new CylindricalJoint("base", new Box(2, 2, 2), {
            axis: Axis.Z,
            linearRange: [0, 2],
            angularRange: [0, 180],
        });
        let moved = screw.connectTo(
            new RigidJoint("pin", new Cylinder(0.2, 1), { jointLocation: Location.IDENTITY }),
        );
        expectPlacement(expected, "moved", moved);
        expectClose(expected, "position", screw.position!, LINEAR_TOLERANCE);
        expectClose(expected, "angle", screw.angle!, LINEAR_TOLERANCE);
    },

    "ball/gimbal": expected => {
        let ball = new BallJoint("socket", cornerBox(1, 1, 1), {
            jointLocation: new Pos(0.5, 0.5, 1),
            angularRange: [
                [-45, 45],
                [-45, 45],
                [0, 360],
            ],
        });
        let rod = new Cylinder(0.15, 2, { align: [Align.Center, Align.Center, Align.Min] });
        let rigid = new RigidJoint("ball", rod, {
            jointLocation: Location.fromOrientation([0, 0, 2], [180, 0, 0]),
        });
        let moved = ball.connectTo(rigid, { angles: [45, 45, 0] });
        expectPlacement(expected, "moved", moved);
        expectLocation(expected, "moved_joint", ball.connectedTo!.location);
        expectLocation(expected, "ball_joint", ball.location);
    },

    "ball/rotation-argument": expected => {
        let relative = (angles: Rotation | [number, number, number] | undefined): Location => {
            let ball = new BallJoint("ball", new Box(1, 1, 1), {
                jointLocation: Location.IDENTITY,
                angularRange: [
                    [0, 90],
                    [0, 90],
                    [0, 90],
                ],
            });
            let rigid = new RigidJoint("rigid", new Box(1, 1, 1), {
                jointLocation: new Pos(0, 0, 0.5),
            });
            return angles === undefined
                ? ball.relativeTo(rigid)
                : ball.relativeTo(rigid, { angles });
        };
        expectLocation(expected, "rotation", relative(new Rotation(10, 20, 30)));
        expectLocation(expected, "tuple", relative([10, 20, 30]));
        expectLocation(expected, "default", relative(undefined));
    },

    "ball/angle-reference-plane": expected => {
        let ball = new BallJoint("socket", new Box(1, 1, 1), {
            jointLocation: new Pos(0, 0, 0.5),
        });
        let moved = ball.connectTo(
            new RigidJoint("rod", new Box(0.2, 0.2, 1), { jointLocation: new Pos(0, 0, -0.5) }),
            { angles: [0, 0, 90] },
        );
        expectPlacement(expected, "moved", moved);
        expectLocation(expected, "ball_joint", ball.location);
    },
});
