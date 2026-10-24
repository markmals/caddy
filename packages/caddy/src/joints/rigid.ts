import type { Shape } from "../topology/shape.ts";
import type { JointConnection } from "./joint.ts";

import { Location } from "../geometry/location.ts";
import { describe, Joint } from "./joint.ts";

export interface RigidJointOptions {
    /** Where the joint sits in global coordinates. Defaults to the origin. */
    readonly jointLocation?: Location;
}

/**
 * A joint that fixes two components to one another (build123d `RigidJoint`).
 *
 * It connects to every other joint kind: the settings of the other joint — `angle`,
 * `position`, `angles` — select where along that joint's freedom the two meet.
 */
export class RigidJoint<Parent extends Shape = Shape> extends Joint<Parent> {
    /** The joint's placement relative to its parent's location. */
    relativeLocation: Location;

    constructor(label: string, toPart: Parent, options: RigidJointOptions = {}) {
        super(label, toPart);
        this.relativeLocation = toPart.location
            .inverse()
            .multiply(options.jointLocation ?? Location.IDENTITY);
    }

    override get location(): Location {
        return this.parent.location.multiply(this.relativeLocation);
    }

    override relativeTo(other: Joint, connection: JointConnection = {}): Location {
        if (!(other instanceof Joint)) {
            throw new TypeError(`other must be a Joint, not ${describe(other)}`);
        }
        if (other instanceof RigidJoint) {
            return this.relativeLocation.multiply(other.relativeLocation.inverse());
        }
        return other.relativeTo(this, connection).inverse();
    }

    override rebind(parent: Shape): RigidJoint {
        let copy = new RigidJoint(this.label, parent);
        copy.relativeLocation = this.relativeLocation;
        return copy;
    }
}
