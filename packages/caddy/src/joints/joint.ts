/**
 * The abstract base of build123d's joints (`Joint` in `topology/shape_core.py`).
 *
 * build123d connects two components by *mutating* the moved one: `connect_to` calls
 * `other.parent.locate(...)` and the caller keeps using the same object. Caddy's shapes are
 * immutable, so {@link Joint#connectTo} returns the repositioned copy of the other joint's
 * parent instead. The copy carries rebound copies of every joint of that parent (see
 * {@link Joint#rebind}), so an assembly is built by threading the returned shapes:
 *
 * ```ts
 * let arm = hinge.joints.get("pin")!.connectTo(armJoint, { angle: 30 });
 * let tool = arm.joints.get("tip")!.connectTo(toolJoint);
 * ```
 */

import type { RotationLike } from "../geometry/location.ts";
import type { Shape } from "../topology/shape.ts";

import { Location } from "../geometry/location.ts";

/** A `(min, max)` pair, in degrees for angles and in millimetres for linear travel. */
export type JointRange = readonly [number, number];

/**
 * What `connectTo` and `relativeTo` accept, mirroring build123d's joint keyword arguments.
 * Each joint reads the settings that apply to it and ignores the rest.
 */
export interface JointConnection {
    /** Rotation in degrees for revolute and cylindrical joints. */
    readonly angle?: number;
    /** Travel along the axis for linear and cylindrical joints. */
    readonly position?: number;
    /** Gimbal angles in degrees for ball joints. */
    readonly angles?: RotationLike;
}

/** A labelled connection point bound to a shape (build123d `Joint`). */
export abstract class Joint<Parent extends Shape = Shape> {
    /** The key this joint is registered under in {@link Shape#joints}. */
    readonly label: string;
    /** The shape this joint is bound to; the joint moves with it. */
    readonly parent: Parent;
    /**
     * The joint last connected to this one — the rebound copy bound to the shape `connectTo`
     * returned, not the joint that was passed in.
     */
    connectedTo: Joint | undefined;

    protected constructor(label: string, parent: Parent) {
        this.label = label;
        this.parent = parent;
        parent.joints.set(label, this);
    }

    /** Where the joint sits in global coordinates, following the parent's location. */
    abstract get location(): Location;

    /** The location that takes `other`'s parent from this joint's frame to where it connects. */
    abstract relativeTo(other: Joint, connection?: JointConnection): Location;

    /**
     * A copy of this joint bound to (and registered on) `parent`, keeping the placement this
     * joint has relative to its own parent. Shapes call it when they copy themselves.
     */
    abstract rebind(parent: Shape): Joint;

    /**
     * Position `other`'s parent so that the two joints meet, returning the repositioned copy.
     *
     * build123d mutates `other.parent` here; the copy this returns carries the same joints,
     * so chained connections read them from the returned shape.
     */
    connectTo<Other extends Shape>(other: Joint<Other>, connection: JointConnection = {}): Other {
        if (!(other instanceof Joint)) {
            throw new TypeError(`other must be a Joint, not ${describe(other)}`);
        }
        let relative = this.relativeTo(other, connection);
        let moved = other.parent.located(this.parent.location.multiply(relative));
        this.connectedTo = moved.joints.get(other.label);
        return moved;
    }
}

/** How an unexpected `other` is named in a TypeError, for callers coming from JavaScript. */
export function describe(value: unknown): string {
    if (typeof value === "object" && value !== null) {
        return value.constructor?.name ?? "object";
    }
    return String(value);
}
