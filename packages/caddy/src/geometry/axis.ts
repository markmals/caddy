import type { VectorLike } from "./vector.ts";

import { GeometryError } from "../errors.ts";
import { DEG2RAD, GEOM_TOLERANCE, RAD2DEG } from "./constants.ts";
import { Location } from "./location.ts";
import { Plane } from "./plane.ts";
import { angleBetween, Vector } from "./vector.ts";

/** Options of {@link Axis#isCoaxial}. */
export interface CoaxialOptions {
    /** How far the directions may differ, in degrees; defaults to 1e-5. */
    readonly angularTolerance?: number;
    /** How far each origin may lie off the other axis; defaults to 1e-5. */
    readonly linearTolerance?: number;
}

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
    isCoaxial(other: Axis, options: CoaxialOptions = {}): boolean {
        let angularTolerance = options.angularTolerance ?? 1e-5;
        let linearTolerance = options.linearTolerance ?? 1e-5;
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

    /**
     * Where this axis meets `other` (build123d `axis & other`): the shared line for coaxial
     * axes, a point where two lines cross, the location itself when its Z direction runs along
     * this axis, and `undefined` when they never meet.
     */
    intersect(point: VectorLike): Vector | undefined;
    intersect(axis: Axis): Vector | Axis | undefined;
    intersect(location: Location): Vector | Location | undefined;
    intersect(plane: Plane): Vector | Axis | undefined;
    intersect(other: Axis | Location | Plane | VectorLike): Vector | Axis | Location | undefined {
        if (other instanceof Axis) {
            return this.intersectAxis(other);
        }
        if (other instanceof Plane) {
            return other.intersect(this);
        }
        if (other instanceof Location) {
            return this.intersectLocation(other);
        }
        return this.intersectPoint(Vector.from(other));
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

    /** This axis when the lines coincide, the crossing point when they meet once. */
    private intersectAxis(other: Axis): Vector | Axis | undefined {
        if (this.isCoaxial(other)) {
            return this;
        }
        if (this.isSkew(other)) {
            return undefined;
        }
        let between = other.position.sub(this.position);
        let cosine = this.direction.dot(other.direction);
        // Antiparallel axes on the same line leave the crossing point undetermined; build123d
        // solves the singular system with numpy's minimum-norm solution, the midpoint.
        let distance =
            this.direction.cross(other.direction).length === 0
                ? between.dot(this.direction) / 2
                : (between.dot(this.direction) - cosine * between.dot(other.direction)) /
                  (1 - cosine * cosine);
        return this.position.add(this.direction.multiply(distance));
    }

    /** A location on this axis, kept whole when it also points along the axis. */
    private intersectLocation(location: Location): Vector | Location | undefined {
        if (this.intersectPoint(location.position) === undefined) {
            return undefined;
        }
        return Plane.fromLocation(location).zDir.equals(this.direction)
            ? location
            : location.position;
    }

    private intersectPoint(point: Vector): Vector | undefined {
        let along = point.sub(this.position).dot(this.direction);
        let projected = this.position.add(this.direction.multiply(along));
        return point.equals(projected) ? point : undefined;
    }
}
