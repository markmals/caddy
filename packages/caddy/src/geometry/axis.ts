import type { VectorLike } from "./vector.ts";

import { GeometryError } from "../errors.ts";
import { DEG2RAD, GEOM_TOLERANCE, RAD2DEG } from "./constants.ts";
import { Location } from "./location.ts";
import { Plane } from "./plane.ts";
import { angleBetween, Vector } from "./vector.ts";

/** An immutable infinite line: a point plus a unit direction (build123d `Axis`). */
export class Axis {
    readonly position: Vector;
    /** Always unit length. */
    readonly direction: Vector;

    constructor(position: VectorLike, direction: VectorLike) {
        let unit = Vector.from(direction);
        if (unit.length === 0) {
            throw new GeometryError("Axis direction must be non-zero");
        }
        this.position = Vector.from(position);
        this.direction = unit.normalized();
    }

    static readonly X: Axis = new Axis([0, 0, 0], [1, 0, 0]);
    static readonly Y: Axis = new Axis([0, 0, 0], [0, 1, 0]);
    static readonly Z: Axis = new Axis([0, 0, 0], [0, 0, 1]);

    /** Axis through two points, directed from `origin` towards `endPoint`. */
    static fromPoints(origin: VectorLike, endPoint: VectorLike): Axis {
        return new Axis(origin, Vector.from(endPoint).sub(origin));
    }

    /** The Z axis of `location`, in world coordinates. */
    static fromLocation(location: Location): Axis {
        return Axis.Z.located(location);
    }

    /** This axis as a location whose Z direction is the axis direction. */
    get location(): Location {
        return Location.fromPlane(new Plane({ origin: this.position, zDir: this.direction }));
    }

    withPosition(position: VectorLike): Axis {
        return new Axis(position, this.direction);
    }

    withDirection(direction: VectorLike): Axis {
        return new Axis(this.position, direction);
    }

    /** Move this axis by `location`, changing both position and direction. */
    located(location: Location): Axis {
        let transform = location.transform;
        return new Axis(transform.apply(this.position), transform.applyDirection(this.direction));
    }

    /**
     * Same line, same way round: the directions agree within `angularTolerance` degrees and each
     * origin lies on the other axis within `linearTolerance`.
     *
     * OCCT's documentation says "parallel", but `gp_Ax1::IsCoaxial` compares directions with
     * `IsEqual`, so a reversed axis is not coaxial.
     */
    isCoaxial(other: Axis, angularTolerance = 1e-5, linearTolerance = 1e-5): boolean {
        let toOther = this.position.sub(other.position).cross(other.direction).length;
        let toSelf = other.position.sub(this.position).cross(this.direction).length;
        return (
            angleBetween(this.direction, other.direction) <= angularTolerance * DEG2RAD &&
            toOther <= linearTolerance &&
            toSelf <= linearTolerance
        );
    }

    /** The directions meet at 90° within `angularTolerance` degrees. */
    isNormal(other: Axis, angularTolerance = 1e-5): boolean {
        let angle = angleBetween(this.direction, other.direction);
        return Math.abs(Math.PI / 2 - angle) <= angularTolerance * DEG2RAD;
    }

    /** The directions are antiparallel within `angularTolerance` degrees. */
    isOpposite(other: Axis, angularTolerance = 1e-5): boolean {
        let angle = angleBetween(this.direction, other.direction);
        return Math.PI - angle <= angularTolerance * DEG2RAD;
    }

    /** The directions are parallel or antiparallel within `angularTolerance` degrees. */
    isParallel(other: Axis, angularTolerance = 1e-5): boolean {
        let angle = angleBetween(this.direction, other.direction);
        let limit = angularTolerance * DEG2RAD;
        return angle <= limit || Math.PI - angle <= limit;
    }

    /** Neither parallel nor coplanar: the axes never meet and do not share a plane. */
    isSkew(other: Axis, tolerance = 1e-5): boolean {
        if (this.isParallel(other, tolerance)) {
            // Parallel axes are skew only in the degenerate sense of being distinct lines.
            return this.position.sub(other.position).cross(this.direction).length > tolerance;
        }
        let coplanarity = this.position
            .sub(other.position)
            .dot(this.direction.cross(other.direction));
        return Math.abs(coplanarity) > tolerance;
    }

    /** Unsigned angle between the directions, in degrees. */
    angleBetween(other: Axis): number {
        return angleBetween(this.direction, other.direction) * RAD2DEG;
    }

    /** A copy with the direction reversed. */
    reverse(): Axis {
        return new Axis(this.position, this.direction.negate());
    }

    /** Alias of {@link reverse}, mapping build123d's unary `-axis`. */
    negate(): Axis {
        return this.reverse();
    }

    equals(other: Axis, tolerance = GEOM_TOLERANCE): boolean {
        return (
            this.position.equals(other.position, tolerance) &&
            this.direction.equals(other.direction, tolerance)
        );
    }

    toString(): string {
        return `Axis: (position=${this.position.toTuple().join(", ")}, direction=${this.direction
            .toTuple()
            .join(", ")})`;
    }
}
