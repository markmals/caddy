import type { Shape } from "../topology/shape.ts";
import type { JointConnection, JointRange } from "./joint.ts";

import { Axis } from "../geometry/axis.ts";
import { Location, Pos } from "../geometry/location.ts";
import { Plane } from "../geometry/plane.ts";
import { Compound } from "../topology/index.ts";
import { midpoint, withinRange } from "./constraints.ts";
import { describe, Joint } from "./joint.ts";
import { RevoluteJoint } from "./revolute.ts";
import { RigidJoint } from "./rigid.ts";
import { axisSymbol } from "./symbols.ts";

export interface LinearJointOptions {
    /** Axis of travel. Defaults to {@link Axis.Z}. */
    readonly axis?: Axis;
    /** Minimum and maximum position along the axis. Defaults to `[0, Infinity]`. */
    readonly linearRange?: JointRange;
}

/**
 * A joint whose component slides along one axis (build123d `LinearJoint`).
 *
 * It connects to a {@link RigidJoint} or a {@link RevoluteJoint}; with a revolute joint the
 * `angle` setting turns the component about that joint's axis as it slides.
 */
export class LinearJoint<Parent extends Shape = Shape> extends Joint<Parent> {
    /** The axis of travel relative to the parent's location. */
    relativeAxis: Axis;
    linearRange: JointRange;
    /** The position along the axis this joint was last connected at. */
    position: number | undefined;
    /** The angle in degrees this joint was last connected at; zero for a rigid counterpart. */
    angle: number | undefined;

    constructor(label: string, toPart: Parent, options: LinearJointOptions = {}) {
        super(label, toPart);
        this.relativeAxis = (options.axis ?? Axis.Z).located(toPart.location.inverse());
        this.linearRange = options.linearRange ?? [0, Number.POSITIVE_INFINITY];
    }

    /** The axis of travel in global coordinates. */
    get axis(): Axis {
        return this.relativeAxis.located(this.parent.location);
    }

    override get location(): Location {
        return this.parent.location.multiply(this.relativeAxis.location);
    }

    /** The axis of travel drawn in global space: the line it spans and a circle at its start. */
    get symbol(): Compound {
        let radius = (this.linearRange[1] - this.linearRange[0]) / 15;
        return axisSymbol({
            from: this.linearRange[0],
            to: this.linearRange[1],
            radius,
        }).moved(this.location);
    }

    override relativeTo(other: Joint, connection: JointConnection = {}): Location {
        if (!(other instanceof RigidJoint) && !(other instanceof RevoluteJoint)) {
            throw new TypeError(
                `other must be a RigidJoint or a RevoluteJoint, not ${describe(other)}`,
            );
        }
        let position = withinRange(
            connection.position ?? midpoint(this.linearRange),
            this.linearRange,
            "position",
        );
        this.position = position;

        let rotation = Location.IDENTITY;
        let angle = 0;
        if (other instanceof RevoluteJoint) {
            angle = withinRange(
                connection.angle ?? other.angularRange[0],
                other.angularRange,
                "angle",
            );
            rotation = Location.fromPlane(
                new Plane({
                    origin: [0, 0, 0],
                    xDir: other.angleReference.rotate(other.relativeAxis, angle),
                    zDir: other.relativeAxis.direction,
                }),
            );
        }
        this.angle = angle;

        let slid = new Pos(
            this.relativeAxis.position.add(this.relativeAxis.direction.multiply(position)),
        ).multiply(rotation);
        let otherRelative =
            other instanceof RevoluteJoint
                ? new Pos(other.relativeAxis.position)
                : other.relativeLocation;
        return slid.multiply(otherRelative.inverse());
    }

    override rebind(parent: Shape): LinearJoint {
        let copy = new LinearJoint(this.label, parent);
        copy.relativeAxis = this.relativeAxis;
        copy.linearRange = this.linearRange;
        copy.position = this.position;
        copy.angle = this.angle;
        return copy;
    }
}
