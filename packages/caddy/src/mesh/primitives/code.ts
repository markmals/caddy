/**
 * Turning detected primitive faces back into source.
 *
 * build123d's `brep_from_stl` emits Python; Caddy emits TypeScript against its own API, because
 * that is the language its users paste the result into. Everything else about the emission is
 * build123d's: the same six axis-aligned planes are recognised by name, the same offsets and
 * in-plane translations are factored out of the placement, numbers are written with the same
 * six significant digits, the lines come out in the same order, and the variable names are
 * chosen by the same rule — the shape the line builds, numbered from zero.
 *
 * | build123d | Caddy |
 * | --- | --- |
 * | `Plane.XY.offset(-5) * Pos(-5, -5) * Rectangle(10, 10, align=Align.MIN)` | `new Rectangle(10, 10, { align: Align.Min }).moved(Plane.XY.offset(-5).transform(new Pos(-5, -5)))` |
 * | `Plane.XY * Face.extrude(Circle(5).edge(), (0, 0, 10))` | `Face.extrude(new Circle(5).edge, [0, 0, 10]).moved(Plane.XY)` |
 * | `Pos((0, 0, 0)) * Sphere(6).faces().filter_by(GeomType.SPHERE)[0]` | `new Sphere(6).faces.filter(GeomType.Sphere).face.moved(new Pos(0, 0, 0))` |
 *
 * build123d writes `plane * shape`, where Caddy writes `shape.moved(plane)`; a Python `Pos`
 * between the two becomes `plane.transform(pos)`, the location that composes them.
 */

import type { Face } from "../../topology/face.ts";

import { Axis } from "../../geometry/axis.ts";
import { Align } from "../../geometry/enums.ts";
import { Location } from "../../geometry/location.ts";
import { Plane } from "../../geometry/plane.ts";
import { roundTo } from "../../geometry/rounding.ts";
import { Vector } from "../../geometry/vector.ts";
import { Rectangle } from "../../sketch/objects/rectangles.ts";
import { GeomType } from "../../topology/enums.ts";

/** build123d's `TOLERANCE`: how close to zero an offset has to be to drop out of the code. */
const TOLERANCE = 1e-4;
/** build123d's `TOL_DIGITS`: decimals a plane origin keeps before it is written out. */
const TOL_DIGITS = 6;
/** Significant digits every emitted number carries, as build123d's `%0.6g` writes them. */
const PRECISION = 6;

/** One emitted statement: its expression, and the key build123d sorts the statements by. */
export interface GeneratedPrimitive {
    /** The right-hand side, or `undefined` when the primitive could not be written out. */
    readonly expression: string | undefined;
    /** build123d's `plane_sort_key`: the placement's name, then its offset along the normal. */
    readonly sortKey: readonly [string, number];
}

interface PlaneConfig {
    readonly zDir: Vector;
    readonly xDir: Vector;
    readonly name: string;
    readonly sign: number;
    readonly offsetOf: (x: number, y: number, z: number) => number;
    readonly positionOf: (x: number, y: number, z: number) => [number, number];
}

/** Every axis-aligned plane that has a name, in the order build123d tries them. */
const PLANE_CONFIGS: readonly PlaneConfig[] = [
    {
        zDir: new Vector(0, 0, 1),
        xDir: new Vector(1, 0, 0),
        name: "Plane.XY",
        sign: 1,
        offsetOf: (_x, _y, z) => z,
        positionOf: (x, y) => [x, y],
    },
    {
        zDir: new Vector(0, 0, -1),
        xDir: new Vector(0, 1, 0),
        name: "Plane.YX",
        sign: -1,
        offsetOf: (_x, _y, z) => z,
        positionOf: (x, y) => [y, x],
    },
    {
        zDir: new Vector(0, 1, 0),
        xDir: new Vector(0, 0, 1),
        name: "Plane.ZX",
        sign: 1,
        offsetOf: (_x, y) => y,
        positionOf: (x, _y, z) => [z, x],
    },
    {
        zDir: new Vector(0, -1, 0),
        xDir: new Vector(1, 0, 0),
        name: "Plane.XZ",
        sign: -1,
        offsetOf: (_x, y) => y,
        positionOf: (x, _y, z) => [x, z],
    },
    {
        zDir: new Vector(1, 0, 0),
        xDir: new Vector(0, 1, 0),
        name: "Plane.YZ",
        sign: 1,
        offsetOf: x => x,
        positionOf: (_x, y, z) => [y, z],
    },
    {
        zDir: new Vector(-1, 0, 0),
        xDir: new Vector(0, 0, 1),
        name: "Plane.ZY",
        sign: -1,
        offsetOf: x => x,
        positionOf: (_x, y, z) => [z, y],
    },
];

/** Placements with no recognised plane sort after the named ones; unknowns sort last. */
const LOCATION_SORT_NAME = "Location";
const UNKNOWN_SORT_NAME = "ZZZ";

/** Write each primitive face as the TypeScript that rebuilds it. */
export function shapesToCode(primitives: readonly Face[]): GeneratedPrimitive[] {
    return primitives.map(primitive => {
        switch (primitive.geomType) {
            case GeomType.Plane:
                return planeCode(primitive);
            case GeomType.Cylinder:
                return cylinderCode(primitive);
            case GeomType.Sphere:
                return sphereCode(primitive);
            default:
                return { expression: undefined, sortKey: [UNKNOWN_SORT_NAME, 0] as const };
        }
    });
}

/**
 * The rectangle a planar face spans, written from its lower-left corner.
 *
 * The face is brought into its own plane, its corner nearest the local origin becomes the
 * plane's origin, and the rectangle is laid out from there. Intersecting the rectangle back
 * against the face catches the case where width and height came out swapped.
 */
function planeCode(primitive: Face): GeneratedPrimitive {
    let plane = planeOfFace(primitive);
    let config = PLANE_CONFIGS.find(candidate => plane.zDir.dot(candidate.zDir) > 1 - TOLERANCE);
    if (config !== undefined) {
        plane = new Plane({ origin: plane.origin, xDir: config.xDir, zDir: config.zDir });
    }

    let local = primitive.transformShape(plane.forwardTransform);
    let corner = local.vertices.groupBy(Axis.X).first.toSorted(Axis.Y)[0]!;
    plane = plane.shiftOrigin(plane.fromLocalCoords([corner.x, corner.y, 0]));
    let size = local.boundingBox.size;
    let width = size.x;
    let height = size.y;

    let rectangle = new Rectangle(width, height, { align: Align.Min }).moved(plane).face;
    let common = rectangle.intersect(primitive)?.faces[0];
    if (common === undefined) {
        return { expression: undefined, sortKey: [UNKNOWN_SORT_NAME, 0] };
    }
    if (Math.abs(common.area - primitive.area) > TOLERANCE) {
        [width, height] = [height, width];
    }

    let placement = placementOf(plane, config, Location.fromPlane(plane));
    let rectangleText = `new Rectangle(${formatNumber(width)}, ${formatNumber(height)}, { align: Align.Min })`;
    return {
        expression: `${rectangleText}.moved(${placement.expression})`,
        sortKey: placement.sortKey,
    };
}

/** The cylindrical face, written as a circle's edge extruded along the axis. */
function cylinderCode(primitive: Face): GeneratedPrimitive {
    let axis = primitive.axisOfRotation;
    if (axis === undefined) {
        return { expression: undefined, sortKey: [UNKNOWN_SORT_NAME, 0] };
    }
    let plane = Plane.fromAxis(axis);
    let config = PLANE_CONFIGS.find(candidate => plane.zDir.dot(candidate.zDir) > 1 - TOLERANCE);
    if (config !== undefined) {
        plane = new Plane({ origin: plane.origin, xDir: config.xDir, zDir: config.zDir });
    }
    let height = primitive.transformShape(plane.forwardTransform).boundingBox.size.z;
    let placement = placementOf(plane, config, primitive.location);
    let radius = primitive.radius ?? 0;
    let extrude = `Face.extrude(new Circle(${formatNumber(radius)}).edge, [0, 0, ${formatNumber(height)}])`;
    return {
        expression: `${extrude}.moved(${placement.expression})`,
        sortKey: placement.sortKey,
    };
}

/** The spherical face, written as the one curved face of a sphere. */
function sphereCode(primitive: Face): GeneratedPrimitive {
    let radius = primitive.radius ?? 0;
    let sphere = `new Sphere(${formatNumber(radius)}).faces.filter(GeomType.Sphere).face`;
    return {
        expression: `${sphere}.moved(${positionText(primitive.position)})`,
        // The line opens with the position rather than a plane, so build123d sorts it last.
        sortKey: [UNKNOWN_SORT_NAME, 0],
    };
}

/**
 * Where a primitive sits, as either a named plane with an offset and an in-plane shift, or the
 * raw location when no named plane lines up.
 */
function placementOf(
    plane: Plane,
    config: PlaneConfig | undefined,
    fallback: Location,
): { expression: string; sortKey: readonly [string, number] } {
    if (config === undefined) {
        return { expression: locationText(fallback), sortKey: [LOCATION_SORT_NAME, 0] };
    }
    let [x, y, z] = plane.origin.toTuple().map(value => roundTo(value, TOL_DIGITS));
    let offset = config.sign * config.offsetOf(x!, y!, z!);
    let [first, second] = config.positionOf(x!, y!, z!);

    let expression = config.name;
    let sortOffset = 0;
    if (Math.abs(offset) >= TOLERANCE) {
        let text = formatNumber(offset);
        expression += `.offset(${text})`;
        // build123d reads its sort key back out of the text it wrote, rounding and all.
        sortOffset = Number(text);
    }
    if (Math.abs(first) >= TOLERANCE || Math.abs(second) >= TOLERANCE) {
        expression += `.transform(new Pos(${formatNumber(first)}, ${formatNumber(second)}))`;
    }
    return { expression, sortKey: [config.name, sortOffset] };
}

/** build123d's `Plane(face)`: the face's centroid, its surface X direction, its outward normal. */
function planeOfFace(face: Face): Plane {
    let surface = face.isPlanar;
    if (surface === undefined) {
        throw new Error("Expected a planar face while generating code");
    }
    return new Plane({
        origin: face.center,
        xDir: surface.xDir.rounded(14),
        zDir: face.normalAt().rounded(14),
    });
}

function locationText(location: Location): string {
    return `Location.fromOrientation(${vectorText(location.position)}, ${vectorText(location.orientation)})`;
}

function positionText(position: Vector): string {
    return `new Pos(${formatVector(position).join(", ")})`;
}

function vectorText(value: Vector): string {
    return `[${formatVector(value).join(", ")}]`;
}

/** build123d's `Vector.__format__`: snap the near-zero components, then six digits each. */
function formatVector(value: Vector): string[] {
    return value
        .toTuple()
        .map(component =>
            formatNumber(Math.abs(component) > 1e-6 ? roundTo(component, PRECISION) : 0),
        );
}

/**
 * A number written as C's `%.6g`, the format build123d's generated code uses: six significant
 * digits, trailing zeros dropped, and an exponent only outside `[1e-4, 1e6)`.
 */
export function formatNumber(value: number, precision = PRECISION): string {
    if (!Number.isFinite(value)) return String(value);
    if (value === 0) return Object.is(value, -0) ? "-0" : "0";
    let scientific = value.toExponential(precision - 1);
    let exponent = Number(scientific.slice(scientific.indexOf("e") + 1));
    if (exponent < -4 || exponent >= precision) {
        let mantissa = trimZeros(scientific.slice(0, scientific.indexOf("e")));
        let sign = exponent < 0 ? "-" : "+";
        let digits = Math.abs(exponent).toString().padStart(2, "0");
        return `${mantissa}e${sign}${digits}`;
    }
    return trimZeros(value.toFixed(Math.max(0, precision - 1 - exponent)));
}

function trimZeros(text: string): string {
    if (!text.includes(".")) return text;
    return text.replace(/\.?0+$/, "");
}
