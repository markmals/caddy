import type { RotationLike } from "../geometry/location.ts";
import type { Shape } from "../topology/shape.ts";
import type { JointConnection, JointRange } from "./joint.ts";

import { Location, Rotation } from "../geometry/location.ts";
import { Plane } from "../geometry/plane.ts";
import { Compound } from "../topology/index.ts";
import { withinRange } from "./constraints.ts";
import { describe, Joint } from "./joint.ts";
import { RigidJoint } from "./rigid.ts";
import { gimbalSymbol } from "./symbols.ts";

/** Per-axis `(min, max)` angle pairs for X, Y and Z. */
export type BallJointRanges = readonly [JointRange, JointRange, JointRange];

export interface BallJointOptions {
    /** Where the joint sits in global coordinates. Defaults to the origin. */
    readonly jointLocation?: Location;
    /** X, Y and Z angle limits in degrees. Defaults to `[[0, 360], [0, 360], [0, 360]]`. */
    readonly angularRange?: BallJointRanges;
    /** The plane, relative to the part, that zero degrees is measured from. Defaults to `Plane.XY`. */
    readonly angleReference?: Plane;
}

/**
 * A joint whose component rotates about all three axes through a gimbal (build123d
 * `BallJoint`). It connects to a {@link RigidJoint}.
 */
export class BallJoint<Parent extends Shape = Shape> extends Joint<Parent> {
    /** The joint's placement relative to its parent's location. */
    relativeLocation: Location;
    angularRange: BallJointRanges;
    /** The plane zero degrees is measured from. */
    angleReference: Plane;

    constructor(label: string, toPart: Parent, options: BallJointOptions = {}) {
        super(label, toPart);
        this.relativeLocation = toPart.location
            .inverse()
            .multiply(options.jointLocation ?? Location.IDENTITY);
        this.angularRange = options.angularRange ?? [
            [0, 360],
            [0, 360],
            [0, 360],
        ];
        this.angleReference = options.angleReference ?? Plane.XY;
    }

    override get location(): Location {
        return this.parent.location.multiply(this.relativeLocation);
    }

    /** The gimbal drawn in global space: three labelled circles about the joint. */
    get symbol(): Compound {
        let radius = this.parent.boundingBox({ optimal: false }).diagonal / 30;
        return gimbalSymbol(radius, this.angleReference).moved(this.location);
    }

    override relativeTo(other: Joint, connection: JointConnection = {}): Location {
        if (!(other instanceof RigidJoint)) {
            throw new TypeError(`other must be a RigidJoint, not ${describe(other)}`);
        }
        let rotation = this.gimbal(connection.angles).multiply(this.angleReference.location);
        let [x, y, z] = rotation.orientation.toTuple();
        let [xRange, yRange, zRange] = this.angularRange;
        withinRange(x, xRange, "angles");
        withinRange(y, yRange, "angles");
        withinRange(z, zRange, "angles");
        return this.relativeLocation.multiply(rotation).multiply(other.relativeLocation.inverse());
    }

    override rebind(parent: Shape): BallJoint {
        let copy = new BallJoint(this.label, parent);
        copy.relativeLocation = this.relativeLocation;
        copy.angularRange = this.angularRange;
        copy.angleReference = this.angleReference;
        return copy;
    }

    /** The three nested rotations, defaulting to the minimum of each range. */
    private gimbal(angles: RotationLike | undefined): Rotation {
        if (angles === undefined) {
            let [x, y, z] = this.angularRange;
            return new Rotation(x[0], y[0], z[0]);
        }
        return angles instanceof Rotation ? angles : new Rotation(angles);
    }
}
