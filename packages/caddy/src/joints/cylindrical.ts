import type { VectorLike } from "../geometry/vector.ts";
import type { Shape } from "../topology/shape.ts";
import type { JointConnection, JointRange } from "./joint.ts";

import { Axis } from "../geometry/axis.ts";
import { Location, Pos } from "../geometry/location.ts";
import { Plane } from "../geometry/plane.ts";
import { Vector } from "../geometry/vector.ts";
import { Compound } from "../topology/index.ts";
import { angleReferenceFor, midpoint, withinRange } from "./constraints.ts";
import { describe, Joint } from "./joint.ts";
import { RigidJoint } from "./rigid.ts";
import { axisSymbol } from "./symbols.ts";

export interface CylindricalJointOptions {
    /** Axis of rotation and travel. Defaults to {@link Axis.Z}. */
    readonly axis?: Axis;
    /** Direction normal to the axis that angles are measured from. Defaults to the axis plane's X. */
    readonly angleReference?: VectorLike;
    /** Minimum and maximum position along the axis. Defaults to `[0, Infinity]`. */
    readonly linearRange?: JointRange;
    /** Minimum and maximum angle in degrees. Defaults to `[0, 360]`. */
    readonly angularRange?: JointRange;
}

/**
 * A joint whose component turns around and slides along one axis, like a screw (build123d
 * `CylindricalJoint`). It connects to a {@link RigidJoint}.
 */
export class CylindricalJoint<Parent extends Shape = Shape> extends Joint<Parent> {
    /** The axis of rotation and travel relative to the parent's location. */
    relativeAxis: Axis;
    /** The direction angles are measured from. */
    angleReference: Vector;
    linearRange: JointRange;
    angularRange: JointRange;
    /** The position along the axis this joint was last connected at. */
    position: number | undefined;
    /** The angle in degrees this joint was last connected at. */
    angle: number | undefined;

    constructor(label: string, toPart: Parent, options: CylindricalJointOptions = {}) {
        let axis = options.axis ?? Axis.Z;
        let angleReference = angleReferenceFor(axis, options.angleReference);
        super(label, toPart);
        this.relativeAxis = axis.located(toPart.location.inverse());
        this.angleReference = angleReference;
        this.linearRange = options.linearRange ?? [0, Number.POSITIVE_INFINITY];
        this.angularRange = options.angularRange ?? [0, 360];
    }

    /** The axis of rotation and travel in global coordinates. */
    get axis(): Axis {
        return this.relativeAxis.located(this.parent.location);
    }

    override get location(): Location {
        return this.parent.location.multiply(this.relativeAxis.location);
    }

    /** The axis drawn in global space: the line it spans, a circle and the angle reference. */
    get symbol(): Compound {
        let radius = (this.linearRange[1] - this.linearRange[0]) / 15;
        return axisSymbol({
            from: this.linearRange[0],
            to: this.linearRange[1],
            radius,
            angleMarker: true,
        }).moved(this.location);
    }

    override relativeTo(other: Joint, connection: JointConnection = {}): Location {
        if (!(other instanceof RigidJoint)) {
            throw new TypeError(`other must be a RigidJoint, not ${describe(other)}`);
        }
        let position = withinRange(
            connection.position ?? midpoint(this.linearRange),
            this.linearRange,
            "position",
        );
        this.position = position;
        let angle = withinRange(
            connection.angle ?? midpoint(this.angularRange),
            this.angularRange,
            "angle",
        );
        this.angle = angle;

        let slid = new Pos(
            this.relativeAxis.position.add(this.relativeAxis.direction.multiply(position)),
        );
        let turned = Location.fromPlane(
            new Plane({
                origin: [0, 0, 0],
                xDir: this.angleReference.rotate(this.relativeAxis, angle),
                zDir: this.relativeAxis.direction,
            }),
        );
        return slid.multiply(turned).multiply(other.relativeLocation.inverse());
    }

    override rebind(parent: Shape): CylindricalJoint {
        let copy = new CylindricalJoint(this.label, parent);
        copy.relativeAxis = this.relativeAxis;
        copy.angleReference = this.angleReference;
        copy.linearRange = this.linearRange;
        copy.angularRange = this.angularRange;
        copy.position = this.position;
        copy.angle = this.angle;
        return copy;
    }
}
