import type * as occt from "@roonieone/occt-native";

import { construct, measure, ShapeType } from "@roonieone/occt-native";

import type { Axis } from "../geometry/axis.ts";
import type { BoundingBox } from "../geometry/bounding-box.ts";
import type { OrientedBoundBox } from "../geometry/oriented-bound-box.ts";
import type { VectorLike } from "../geometry/vector.ts";
import type { Until } from "../operations/extrude-until.ts";
import type { TaperOptions } from "../operations/taper.ts";
import type { Edge } from "./edge.ts";
import type { Face } from "./face.ts";
import type { LoftOptions } from "./makers/loft.ts";
import type { RevolveOptions } from "./makers/revolve.ts";
import type {
    PrimitiveOptions,
    SphereOptions,
    SweptPrimitiveOptions,
    TorusOptions,
} from "./makers/solid-primitives.ts";
import type { SolidSweepOptions, SweepModeOptions } from "./makers/sweep.ts";
import type { TwistOptions } from "./makers/twist.ts";
import type { Shape, ShapeOptions } from "./shape.ts";
import type { Vertex } from "./vertex.ts";
import type { Wire } from "./wire.ts";

import { Vector } from "../geometry/vector.ts";
import { extrudeUntil } from "../operations/extrude-until.ts";
import { extrudeTaper } from "../operations/taper.ts";
import { native } from "./kernel.ts";
import { extrudeFace } from "./makers/extrude.ts";
import { makeLoftSolid } from "./makers/loft.ts";
import { revolveSolid } from "./makers/revolve.ts";
import {
    fromBoundingBox,
    makeBox,
    makeCone,
    makeCylinder,
    makeSphere,
    makeTorus,
    makeWedge,
} from "./makers/solid-primitives.ts";
import { sweepMulti, sweepSolid } from "./makers/sweep.ts";
import { extrudeLinearWithRotation } from "./makers/twist.ts";
import { Mixin3D } from "./mixin3d.ts";
import { registerShapeConstructor } from "./registry.ts";
import { Shell } from "./shell.ts";

/** Options of {@link Solid.extrudeUntil}. */
export interface ExtrudeUntilOptions {
    /** Which bounding surface of the target stops the extrusion; defaults to `Until.Next`. */
    readonly until?: Until;
}

/** A closed volume bounded by shells (build123d `Solid`). */
export class Solid extends Mixin3D {
    static override readonly order: number = 3;

    /** Wrap a native solid. */
    constructor(wrapped: occt.Shape, options?: ShapeOptions);
    /** The solid bounded by `shell` (build123d `Solid(shell)`). */
    constructor(shell: Shell, options?: ShapeOptions);
    constructor(source: occt.Shape | Shell, options: ShapeOptions = {}) {
        super(
            source instanceof Shell
                ? native("Solid construction", () => construct.makeSolidFromShell(source.wrapped))
                : source,
            options,
        );
    }

    /** Extrude a face by a direction and magnitude (build123d `Solid.extrude`). */
    static extrude(profile: Face, direction: VectorLike): Solid {
        return extrudeFace(profile, direction);
    }

    /** A box at the plane's origin, extending along its positive axes. */
    static makeBox(
        length: number,
        width: number,
        height: number,
        options?: PrimitiveOptions,
    ): Solid {
        return makeBox(length, width, height, options);
    }

    /** A full or partial cone with its base centred on the plane's origin. */
    static makeCone(
        baseRadius: number,
        topRadius: number,
        height: number,
        options?: SweptPrimitiveOptions,
    ): Solid {
        return makeCone(baseRadius, topRadius, height, options);
    }

    /** A full or partial cylinder with its base centred on the plane's origin. */
    static makeCylinder(radius: number, height: number, options?: SweptPrimitiveOptions): Solid {
        return makeCylinder(radius, height, options);
    }

    /** A full or partial sphere centred on the plane's origin. */
    static makeSphere(radius: number, options?: SphereOptions): Solid {
        return makeSphere(radius, options);
    }

    /** A full or partial torus around the plane's Z axis. */
    static makeTorus(majorRadius: number, minorRadius: number, options?: TorusOptions): Solid {
        return makeTorus(majorRadius, minorRadius, options);
    }

    /** A box whose top face spans `minX`..`maxX` by `minZ`..`maxZ`. */
    static makeWedge(
        deltaX: number,
        deltaY: number,
        deltaZ: number,
        minX: number,
        minZ: number,
        maxX: number,
        maxZ: number,
        options?: PrimitiveOptions,
    ): Solid {
        return makeWedge(deltaX, deltaY, deltaZ, minX, minZ, maxX, maxZ, options);
    }

    /** A box of the same size and position as `bounds`. */
    static fromBoundingBox(bounds: BoundingBox | OrientedBoundBox): Solid {
        return fromBoundingBox(bounds);
    }

    /**
     * The solid skinned through the sections; vertices may only cap the run
     * (build123d `Solid.make_loft`).
     */
    static makeLoft(objs: Iterable<Vertex | Wire>, options?: LoftOptions): Solid {
        return makeLoftSolid(objs, options);
    }

    /** Revolve a 2D section `angle` degrees about `axis`. */
    static revolve(
        section: Face | Wire,
        angle: number,
        axis: Axis,
        options?: RevolveOptions,
    ): Solid {
        return revolveSolid(section, angle, axis, options);
    }

    /** Sweep a 2D section along `path`; holes in the section are cut from the result. */
    static sweep(
        section: Face | Wire,
        path: Edge | Wire,
        options?: SolidSweepOptions,
    ): Solid | Shell {
        return sweepSolid(section, path, options);
    }

    /** Sweep through a sequence of sections along `path` (build123d `Solid.sweep_multi`). */
    static sweepMulti(
        profiles: Iterable<Wire | Face>,
        path: Edge | Wire,
        options?: SweepModeOptions,
    ): Solid {
        return sweepMulti(profiles, path, options);
    }

    /** Extrude `section` along `normal` from `center` while turning it `angle` degrees. */
    static extrudeLinearWithRotation(
        section: Face | Wire,
        center: VectorLike,
        normal: VectorLike,
        angle: number,
        options?: TwistOptions,
    ): Solid {
        return extrudeLinearWithRotation(section, center, normal, angle, options);
    }

    /** Extrude a face into a prism whose walls lean `taper` degrees inwards. */
    static extrudeTaper(
        profile: Face,
        direction: VectorLike,
        taper: number,
        options: TaperOptions = {},
    ): Solid {
        return extrudeTaper(profile, Vector.from(direction), taper, options) as Solid;
    }

    /** Extrude a face until it reaches a bounding surface of `target`. */
    static extrudeUntil(
        profile: Face,
        target: Shape,
        direction: VectorLike,
        options: ExtrudeUntilOptions = {},
    ): Solid {
        return extrudeUntil(profile, target, direction, options.until) as Solid;
    }

    get volume(): number {
        return native("Volume", () => measure.massProperties(this.wrapped, "volume").mass);
    }
}

registerShapeConstructor(ShapeType.Solid, wrapped => new Solid(wrapped));
