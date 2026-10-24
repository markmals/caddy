import type { EulerOrdering } from "./enums.ts";
import type { VectorLike } from "./vector.ts";

import { Axis } from "./axis.ts";
import { DEG2RAD, GEOM_TOLERANCE, RAD2DEG } from "./constants.ts";
import { Intrinsic } from "./enums.ts";
import { Plane } from "./plane.ts";
import { Quaternion } from "./quaternion.ts";
import { Transform } from "./transform.ts";
import { Vector } from "./vector.ts";

/** Rotation given either as Euler angles in degrees or as a `Rotation`. */
export type RotationLike = Rotation | VectorLike;

/**
 * A rigid placement in 3D space — a position plus an orientation (build123d `Location`).
 *
 * Locations compose with {@link multiply}: `a.multiply(b)` applies `b` first, then `a`.
 */
export class Location {
    /** The underlying affine transformation. */
    readonly transform: Transform;

    constructor(transform: Transform = Transform.IDENTITY) {
        this.transform = transform;
    }

    static readonly IDENTITY: Location = new Location();

    static fromTransform(transform: Transform): Location {
        return new Location(transform);
    }

    /** Translation to `position`, optionally turned `angle` degrees about the world Z axis. */
    static fromPosition(position: VectorLike, angle = 0): Location {
        return Location.fromAxisAngle(position, [0, 0, 1], angle);
    }

    /**
     * Translation to `position` combined with a turn of `angle` degrees about `direction`.
     *
     * The rotation axis passes through the world origin, not through `position`.
     */
    static fromAxisAngle(position: VectorLike, direction: VectorLike, angle: number): Location {
        return new Location(
            Transform.fromAxisRotation(
                new Vector(),
                Vector.from(direction),
                angle * DEG2RAD,
            ).withTranslation(Vector.from(position)),
        );
    }

    /** Translation to `position` with Euler angles in degrees applied in `ordering`. */
    static fromOrientation(
        position: VectorLike,
        orientation: VectorLike,
        ordering: EulerOrdering = Intrinsic.XYZ,
    ): Location {
        let angles = Vector.from(orientation);
        let rotation = Quaternion.fromEulerAngles(
            ordering,
            angles.x * DEG2RAD,
            angles.y * DEG2RAD,
            angles.z * DEG2RAD,
        );
        return new Location(
            Transform.fromRotation(rotation).withTranslation(Vector.from(position)),
        );
    }

    /** The location of a plane's coordinate system. */
    static fromPlane(plane: Plane): Location {
        return new Location(Transform.fromCoordinateSystem(plane).inverse());
    }

    get position(): Vector {
        return this.transform.translation;
    }

    /** Intrinsic XYZ Euler angles in degrees. */
    get orientation(): Vector {
        let [x, y, z] = this.transform.rotation.toEulerAngles(Intrinsic.XYZ);
        return new Vector(x * RAD2DEG, y * RAD2DEG, z * RAD2DEG);
    }

    /** X axis of this location's frame, used when the location acts as a plane. */
    get xAxis(): Axis {
        let plane = Plane.fromLocation(this);
        return new Axis(plane.origin, plane.xDir);
    }

    get yAxis(): Axis {
        let plane = Plane.fromLocation(this);
        return new Axis(plane.origin, plane.yDir);
    }

    get zAxis(): Axis {
        let plane = Plane.fromLocation(this);
        return new Axis(plane.origin, plane.zDir);
    }

    /** Replace the position, keeping the orientation. */
    withPosition(position: VectorLike): Location {
        return new Location(
            Transform.fromTranslation(Vector.from(position)).multiply(
                Transform.fromRotation(this.transform.rotation),
            ),
        );
    }

    /** Replace the orientation with intrinsic XYZ angles in degrees, keeping the position. */
    withOrientation(orientation: VectorLike): Location {
        let angles = Vector.from(orientation);
        let rotation = Quaternion.fromEulerAngles(
            Intrinsic.XYZ,
            angles.x * DEG2RAD,
            angles.y * DEG2RAD,
            angles.z * DEG2RAD,
        );
        return new Location(
            Transform.fromTranslation(this.transform.translation).multiply(
                Transform.fromRotation(rotation),
            ),
        );
    }

    inverse(): Location {
        return new Location(this.transform.inverse());
    }

    /** Compose with another location: apply `other` first, then this one. */
    multiply(other: Location): Location;
    /** Place a plane relative to this location, as build123d's `location * plane` does. */
    multiply(other: Plane): Plane;
    multiply(other: Location | Plane): Location | Plane {
        if (other instanceof Plane) {
            return other.moved(this);
        }
        return new Location(this.transform.multiply(other.transform));
    }

    /** Repeat this location `exponent` times; negative exponents invert first. */
    power(exponent: number): Location {
        return new Location(this.transform.power(exponent));
    }

    /** Flip the orientation without moving the position (build123d unary `-location`). */
    negate(): Location {
        return Location.fromPlane(Plane.fromLocation(this).reverse());
    }

    /** The position; provided so locations sort alongside other geometry. */
    center(): Vector {
        return this.position;
    }

    /**
     * Reflect position and orientation across `mirrorPlane`.
     *
     * A true reflection of a right-handed frame is left-handed, which build123d does not allow,
     * so the X and Z directions are mirrored and Y is rebuilt from them.
     */
    mirror(mirrorPlane: Plane): Location {
        let normal = mirrorPlane.zDir;
        let reflect = (v: Vector): Vector => v.sub(normal.multiply(2 * v.dot(normal)));
        let distance = this.position.sub(mirrorPlane.origin).dot(normal);
        let frame = Plane.fromLocation(this);
        return Location.fromPlane(
            new Plane({
                origin: this.position.sub(normal.multiply(2 * distance)),
                xDir: reflect(frame.xDir),
                zDir: reflect(frame.zDir),
            }),
        );
    }

    /**
     * Where this placement meets `other` (build123d `location & other`): this location when
     * `other` agrees with it completely, the shared position when only the positions agree, and
     * `undefined` when the position is not on `other` at all.
     */
    intersect(point: VectorLike): Vector | undefined;
    intersect(axis: Axis): Vector | Location | undefined;
    intersect(plane: Plane): Vector | Location | undefined;
    intersect(location: Location): Vector | Location | undefined;
    intersect(other: Axis | Location | Plane | VectorLike): Vector | Location | undefined {
        if (other instanceof Axis || other instanceof Plane) {
            return other.intersect(this);
        }
        if (other instanceof Location) {
            if (this.equals(other)) {
                return this;
            }
            return this.position.equals(other.position) ? this.position : undefined;
        }
        let point = Vector.from(other);
        return this.position.equals(point) ? point : undefined;
    }

    /** Equal position and equal rotation; quaternions are compared up to their sign. */
    equals(other: Location, tolerance = GEOM_TOLERANCE): boolean {
        if (!this.position.equals(other.position, tolerance)) {
            return false;
        }
        let mine = this.transform.rotation;
        let theirs = other.transform.rotation;
        return mine.equals(theirs, tolerance) || mine.equals(theirs.scaled(-1), tolerance);
    }

    toString(): string {
        return (
            `${this.constructor.name}: (position=${this.position.toTuple().join(", ")}, ` +
            `orientation=${this.orientation.toTuple().join(", ")})`
        );
    }

    /** Position then orientation, so a location destructures as build123d's iteration does. */
    *[Symbol.iterator](): IterableIterator<Vector> {
        yield this.position;
        yield this.orientation;
    }
}

/** A location that only rotates (build123d `Rotation`, aliased as `Rot`). */
export class Rotation extends Location {
    /** Euler angles in degrees about X, Y, and Z. */
    constructor(x?: number, y?: number, z?: number, ordering?: EulerOrdering);
    /** Euler angles in degrees, as a vector. */
    constructor(angles: VectorLike, ordering?: EulerOrdering);
    /** A turn of `angle` degrees about `axis`. */
    constructor(axis: Axis, angle: number);
    constructor(
        first: number | VectorLike | Axis = 0,
        second: number | EulerOrdering = 0,
        third = 0,
        fourth: EulerOrdering = Intrinsic.XYZ,
    ) {
        if (first instanceof Axis) {
            if (typeof second !== "number") {
                throw new TypeError("Rotation about an axis needs an angle in degrees");
            }
            super(Transform.fromAxisRotation(first.position, first.direction, second * DEG2RAD));
            return;
        }
        let angles: Vector;
        let ordering: EulerOrdering;
        if (typeof first === "number") {
            angles = new Vector(first, typeof second === "number" ? second : 0, third);
            ordering = fourth;
        } else {
            angles = Vector.from(first);
            ordering = typeof second === "string" ? second : Intrinsic.XYZ;
        }
        super(Location.fromOrientation(new Vector(), angles, ordering).transform);
    }
}

/** Short form of {@link Rotation} for algebraic notation, as in build123d. */
export { Rotation as Rot };

/** A location that only translates (build123d `Pos`). */
export class Pos extends Location {
    constructor(x?: number, y?: number, z?: number);
    constructor(position: VectorLike);
    constructor(first: number | VectorLike = 0, y = 0, z = 0) {
        super(
            Transform.fromTranslation(
                typeof first === "number" ? new Vector(first, y, z) : Vector.from(first),
            ),
        );
    }
}
