import type { EulerOrdering } from "./enums.ts";
import type { CoordinateSystem } from "./transform.ts";
import type { VectorLike } from "./vector.ts";

import { GeometryError } from "../errors.ts";
import { Axis } from "./axis.ts";
import { BoundingBox } from "./bounding-box.ts";
import { DEG2RAD, GEOM_TOLERANCE, TOLERANCE } from "./constants.ts";
import { Intrinsic } from "./enums.ts";
import { Location } from "./location.ts";
import { Quaternion } from "./quaternion.ts";
import { Transform } from "./transform.ts";
import { angleBetween, Vector } from "./vector.ts";

/** The world frame, used as the reference for local/global conversions. */
const GLOBAL_FRAME: CoordinateSystem = {
    origin: new Vector(0, 0, 0),
    xDir: new Vector(1, 0, 0),
    yDir: new Vector(0, 1, 0),
    zDir: new Vector(0, 0, 1),
};

/**
 * Ways to pin down a plane's frame.
 *
 * `zDir` defaults to +Z. When `xDir` is omitted it is derived from `zDir` the way OCCT derives a
 * `gp_Ax3` X direction. `yDir` is an alternative to `zDir` and requires `xDir`.
 */
export interface PlaneOptions {
    readonly origin?: VectorLike;
    readonly xDir?: VectorLike;
    readonly yDir?: VectorLike;
    readonly zDir?: VectorLike;
}

/**
 * An immutable right-handed coordinate system whose XY plane is the plane itself
 * (build123d `Plane`).
 */
export class Plane implements CoordinateSystem {
    readonly origin: Vector;
    readonly xDir: Vector;
    readonly yDir: Vector;
    readonly zDir: Vector;

    constructor(options: PlaneOptions = {}) {
        let origin = options.origin === undefined ? new Vector() : Vector.from(options.origin);
        let xDir = options.xDir === undefined ? undefined : Vector.from(options.xDir);
        let zDir: Vector;

        if (options.yDir !== undefined) {
            if (options.zDir !== undefined) {
                throw new GeometryError("Specify either yDir or zDir, not both");
            }
            if (xDir === undefined) {
                throw new GeometryError("xDir must be provided when yDir is specified");
            }
            if (xDir.length === 0) {
                throw new GeometryError("xDir must be non-zero");
            }
            let yInput = Vector.from(options.yDir);
            if (yInput.length === 0) {
                throw new GeometryError("yDir must be non-zero");
            }
            let xUnit = xDir.normalized();
            let normal = xUnit.cross(yInput.normalized());
            if (normal.length === 0) {
                throw new GeometryError("xDir and yDir must not be parallel");
            }
            zDir = normal.normalized();
            xDir = zDir.cross(xUnit).normalized().cross(zDir).normalized();
        } else {
            let normal =
                options.zDir === undefined ? new Vector(0, 0, 1) : Vector.from(options.zDir);
            if (normal.length === 0) {
                throw new GeometryError("zDir must be non-zero");
            }
            zDir = normal.normalized();
            if (xDir === undefined) {
                xDir = defaultXDirection(zDir);
            } else if (xDir.length === 0) {
                throw new GeometryError("xDir must be non-zero");
            } else {
                xDir = xDir.normalized();
            }
        }

        // gp_Ax3(origin, zDir, xDir): project xDir into the plane, then complete the frame.
        let planar = zDir.cross(xDir.cross(zDir));
        if (planar.length === 0) {
            throw new GeometryError("xDir must not be parallel to zDir");
        }
        this.origin = origin;
        this.zDir = zDir;
        this.xDir = planar.normalized();
        this.yDir = zDir.cross(this.xDir).normalized();
    }

    /** Plane through three points: X towards the second, normal towards the third. */
    static fromPoints(first: VectorLike, second: VectorLike, third: VectorLike): Plane {
        let origin = Vector.from(first);
        let xDir = Vector.from(second).sub(origin);
        return new Plane({ origin, xDir, zDir: xDir.cross(Vector.from(third).sub(origin)) });
    }

    /** Plane normal to `axis` at its position. */
    static fromAxis(axis: Axis, xDir?: VectorLike): Plane {
        return xDir === undefined
            ? new Plane({ origin: axis.position, zDir: axis.direction })
            : new Plane({ origin: axis.position, xDir, zDir: axis.direction });
    }

    /**
     * Plane aligned with `location`.
     *
     * build123d rounds the directions it reads back out of OCCT to 14 decimals, which snaps the
     * ~1e-17 residues of trigonometric rotations to zero; that rounding is reproduced here
     * because it is visible in the resulting directions.
     */
    static fromLocation(location: Location): Plane {
        let transform = location.transform;
        return new Plane({
            origin: location.position,
            xDir: transform.applyDirection(GLOBAL_FRAME.xDir).rounded(14),
            zDir: transform.applyDirection(GLOBAL_FRAME.zDir).rounded(14),
        });
    }

    static readonly XY: Plane = new Plane({ xDir: [1, 0, 0], zDir: [0, 0, 1] });
    static readonly YZ: Plane = new Plane({ xDir: [0, 1, 0], zDir: [1, 0, 0] });
    static readonly ZX: Plane = new Plane({ xDir: [0, 0, 1], zDir: [0, 1, 0] });
    static readonly XZ: Plane = new Plane({ xDir: [1, 0, 0], zDir: [0, -1, 0] });
    static readonly YX: Plane = new Plane({ xDir: [0, 1, 0], zDir: [0, 0, -1] });
    static readonly ZY: Plane = new Plane({ xDir: [0, 0, 1], zDir: [-1, 0, 0] });
    static readonly front: Plane = new Plane({ xDir: [1, 0, 0], zDir: [0, -1, 0] });
    static readonly back: Plane = new Plane({ xDir: [-1, 0, 0], zDir: [0, 1, 0] });
    static readonly left: Plane = new Plane({ xDir: [0, -1, 0], zDir: [-1, 0, 0] });
    static readonly right: Plane = new Plane({ xDir: [0, 1, 0], zDir: [1, 0, 0] });
    static readonly top: Plane = new Plane({ xDir: [1, 0, 0], zDir: [0, 0, 1] });
    static readonly bottom: Plane = new Plane({ xDir: [1, 0, 0], zDir: [0, 0, -1] });
    static readonly isometric: Plane = new Plane({
        xDir: [1 / Math.SQRT2, 1 / Math.SQRT2, 0],
        zDir: [1 / Math.sqrt(3), -1 / Math.sqrt(3), 1 / Math.sqrt(3)],
    });

    /** Move the origin along the normal by `amount`, keeping the orientation. */
    offset(amount: number): Plane {
        return new Plane({
            origin: this.origin.add(this.zDir.multiply(amount)),
            xDir: this.xDir,
            zDir: this.zDir,
        });
    }

    /** Flip the normal, keeping origin and X direction. */
    reverse(): Plane {
        return new Plane({ origin: this.origin, xDir: this.xDir, zDir: this.zDir.negate() });
    }

    /** Alias of {@link reverse}, mapping build123d's unary `-plane`. */
    negate(): Plane {
        return this.reverse();
    }

    withOrigin(origin: VectorLike): Plane {
        return new Plane({ origin, xDir: this.xDir, zDir: this.zDir });
    }

    /** Rotate the frame about the normal so that X points as close to `xDir` as possible. */
    withXDir(xDir: VectorLike): Plane {
        return new Plane({ origin: this.origin, xDir, zDir: this.zDir });
    }

    /** Rotate the frame about the normal so that Y points as close to `yDir` as possible. */
    withYDir(yDir: VectorLike): Plane {
        let unit = Vector.from(yDir);
        if (unit.length === 0) {
            throw new GeometryError("yDir must be non-zero");
        }
        return new Plane({ origin: this.origin, xDir: unit.cross(this.zDir), zDir: this.zDir });
    }

    /** Move the origin within the plane to `locator`, keeping X and Z directions. */
    shiftOrigin(locator: Axis | VectorLike): Plane {
        if (locator instanceof Axis) {
            let denominator = locator.direction.dot(this.zDir);
            if (Math.abs(denominator) <= TOLERANCE) {
                throw new GeometryError(`${locator.toString()} does not intersect the plane`);
            }
            let distance = this.origin.sub(locator.position).dot(this.zDir) / denominator;
            return this.withOrigin(locator.position.add(locator.direction.multiply(distance)));
        }
        let point = Vector.from(locator);
        if (!this.contains(point)) {
            throw new GeometryError(`${point.toString()} is not located within plane`);
        }
        return this.withOrigin(point);
    }

    /** Rotate about the plane's own axes by Euler angles in degrees, origin unchanged. */
    rotated(rotation: VectorLike = [0, 0, 0], ordering: EulerOrdering = Intrinsic.XYZ): Plane {
        let angles = Vector.from(rotation);
        let quaternion = Quaternion.fromEulerAngles(
            ordering,
            angles.x * DEG2RAD,
            angles.y * DEG2RAD,
            angles.z * DEG2RAD,
        );
        let rotate = Transform.fromRotation(quaternion);
        return new Plane({
            origin: this.origin,
            xDir: rotate.applyDirection(this.xDir),
            zDir: rotate.applyDirection(this.zDir),
        });
    }

    /** A copy repositioned by the relative location `loc`. */
    moved(loc: Location | Plane): Plane {
        let relative = loc instanceof Plane ? loc.location : loc;
        return Plane.fromLocation(this.location.multiply(relative));
    }

    /** This plane expressed as a location. */
    get location(): Location {
        return Location.fromPlane(this);
    }

    /** World to local transformation. */
    get forwardTransform(): Transform {
        return Transform.betweenCoordinateSystems(GLOBAL_FRAME, this);
    }

    /** Local to world transformation. */
    get reverseTransform(): Transform {
        return Transform.betweenCoordinateSystems(this, GLOBAL_FRAME);
    }

    /** Express a world point or bounding box in this plane's local coordinates. */
    toLocalCoords(point: VectorLike): Vector;
    toLocalCoords(box: BoundingBox): BoundingBox;
    toLocalCoords(obj: VectorLike | BoundingBox): Vector | BoundingBox {
        return repositioned(obj, this.forwardTransform);
    }

    /** Read a point or bounding box given in this plane's local coordinates as world values. */
    fromLocalCoords(point: VectorLike): Vector;
    fromLocalCoords(box: BoundingBox): BoundingBox;
    fromLocalCoords(obj: VectorLike | BoundingBox): Vector | BoundingBox {
        return repositioned(obj, this.reverseTransform);
    }

    /** The location that takes this plane's frame onto `other`'s. */
    locationBetween(other: Plane): Location {
        return Location.fromTransform(Transform.betweenCoordinateSystems(this, other));
    }

    /** Is the point or axis fully contained in this plane? */
    contains(obj: VectorLike | Axis, tolerance = TOLERANCE): boolean {
        if (obj instanceof Axis) {
            return (
                this.contains(obj.position, tolerance) &&
                Math.abs(Math.PI / 2 - angleBetween(this.zDir, obj.direction)) <= tolerance
            );
        }
        return Math.abs(Vector.from(obj).sub(this.origin).dot(this.zDir)) <= tolerance;
    }

    /** Compose: place `other` relative to this plane (build123d `plane * other`). */
    multiply(other: Location | Plane): Location {
        return this.location.multiply(other instanceof Plane ? other.location : other);
    }

    /** The plane's frame as a plain coordinate system. */
    toCoordinateSystem(): CoordinateSystem {
        return { origin: this.origin, xDir: this.xDir, yDir: this.yDir, zDir: this.zDir };
    }

    equals(other: Plane, tolerance = GEOM_TOLERANCE): boolean {
        return (
            this.origin.equals(other.origin, tolerance) &&
            this.xDir.equals(other.xDir, tolerance) &&
            this.zDir.equals(other.zDir, tolerance)
        );
    }

    toString(): string {
        return (
            `Plane: (origin=${this.origin.toTuple().join(", ")}, ` +
            `xDir=${this.xDir.toTuple().join(", ")}, zDir=${this.zDir.toTuple().join(", ")})`
        );
    }
}

/**
 * OCCT's choice of X direction for a frame given only a normal (`gp_Ax3(gp_Pnt, gp_Dir)`): zero
 * out the smallest normal component and swap the other two, so the result is exactly orthogonal.
 */
function defaultXDirection(normal: Vector): Vector {
    let { x: a, y: b, z: c } = normal;
    let aAbs = Math.abs(a);
    let bAbs = Math.abs(b);
    let cAbs = Math.abs(c);
    if (bAbs <= aAbs && bAbs <= cAbs) {
        return (aAbs > cAbs ? new Vector(-c, 0, a) : new Vector(c, 0, -a)).normalized();
    }
    if (aAbs <= bAbs && aAbs <= cAbs) {
        return (bAbs > cAbs ? new Vector(0, -c, b) : new Vector(0, c, -b)).normalized();
    }
    return (aAbs > bAbs ? new Vector(-b, a, 0) : new Vector(b, -a, 0)).normalized();
}

/** Shared body of `toLocalCoords`/`fromLocalCoords`; corners move, they are not re-ordered. */
function repositioned(obj: VectorLike | BoundingBox, transform: Transform): Vector | BoundingBox {
    if (obj instanceof BoundingBox) {
        return new BoundingBox(transform.apply(obj.min), transform.apply(obj.max));
    }
    return Vector.from(obj).transform(transform);
}
