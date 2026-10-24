import type { VectorLike } from "../geometry/vector.ts";
import type { Shape } from "../topology/shape.ts";
import type { JointConnection, JointRange } from "./joint.ts";

import { Axis } from "../geometry/axis.ts";
import { Location, Rotation } from "../geometry/location.ts";
import { Plane } from "../geometry/plane.ts";
import { Vector } from "../geometry/vector.ts";
import { Compound } from "../topology/index.ts";
import { angleReferenceFor, withinRange } from "./constraints.ts";
import { describe, Joint } from "./joint.ts";
import { RigidJoint } from "./rigid.ts";
import { axisSymbol } from "./symbols.ts";

export interface RevoluteJointOptions {
    /** Axis of rotation. Defaults to {@link Axis.Z}. */
    readonly axis?: Axis;
    /** Direction normal to the axis that angles are measured from. Defaults to the axis plane's X. */
    readonly angleReference?: VectorLike;
    /** Minimum and maximum angle in degrees. Defaults to `[0, 360]`. */
    readonly angularRange?: JointRange;
}

/** A joint whose component rotates around an axis, like a hinge (build123d `RevoluteJoint`). */
export class RevoluteJoint<Parent extends Shape = Shape> extends Joint<Parent> {
    /** The axis of rotation relative to the parent's location. */
    relativeAxis: Axis;
    /** The direction angles are measured from. */
    angleReference: Vector;
    angularRange: JointRange;
    /** The angle in degrees this joint was last connected at. */
    angle: number | undefined;
    /** build123d rotates the angle reference only when the caller supplied one. */
    private referenceGiven: boolean;

    constructor(label: string, toPart: Parent, options: RevoluteJointOptions = {}) {
        let axis = options.axis ?? Axis.Z;
        let angleReference = angleReferenceFor(axis, options.angleReference);
        super(label, toPart);
        this.relativeAxis = axis.located(toPart.location.inverse());
        this.angleReference = angleReference;
        this.angularRange = options.angularRange ?? [0, 360];
        this.referenceGiven = options.angleReference !== undefined;
    }

    override get location(): Location {
        return this.parent.location.multiply(this.relativeAxis.location);
    }

    /** The axis of rotation drawn in global space: an axis line, a circle and the reference. */
    get symbol(): Compound {
        let radius = this.parent.getBoundingBox({ optimal: false }).diagonal / 30;
        return axisSymbol({ from: 0, to: radius * 10, radius, angleMarker: true }).moved(
            this.location,
        );
    }

    override relativeTo(other: Joint, connection: JointConnection = {}): Location {
        if (!(other instanceof RigidJoint)) {
            throw new TypeError(`other must be a RigidJoint, not ${describe(other)}`);
        }
        let angle = withinRange(
            connection.angle ?? this.angularRange[0],
            this.angularRange,
            "angle",
        );
        this.angle = angle;
        // build123d turns a full circle instead of standing still, which keeps the rotation
        // well defined when the angle reference and the X direction coincide.
        let turn = angle === 0 ? 360 : angle;
        let rotation = this.referenceGiven
            ? Location.fromPlane(
                  new Plane({
                      origin: [0, 0, 0],
                      xDir: this.angleReference.rotate(this.relativeAxis, turn),
                      zDir: this.relativeAxis.direction,
                  }),
              )
            : new Rotation(0, 0, turn);
        return this.relativeAxis.location
            .multiply(rotation)
            .multiply(other.relativeLocation.inverse());
    }

    override rebind(parent: Shape): RevoluteJoint {
        let copy = new RevoluteJoint(this.label, parent);
        copy.relativeAxis = this.relativeAxis;
        copy.angleReference = this.angleReference;
        copy.angularRange = this.angularRange;
        copy.referenceGiven = this.referenceGiven;
        copy.angle = this.angle;
        return copy;
    }
}
