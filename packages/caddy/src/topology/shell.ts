import type * as occt from "@roonieone/occt-native";

import { construct, measure, query, ShapeType, shapes } from "@roonieone/occt-native";

import type { Axis } from "../geometry/axis.ts";
import type { Location } from "../geometry/location.ts";
import type { VectorLike } from "../geometry/vector.ts";
import type { Transition } from "../operations/sweep.ts";
import type { SurfaceLocationOptions } from "./face-location.ts";
import type { Face } from "./face.ts";
import type { LoftOptions } from "./makers/loft.ts";
import type { Shape, ShapeOptions } from "./shape.ts";
import type { Vertex } from "./vertex.ts";
import type { Wire } from "./wire.ts";

import { InvalidShapeError } from "../errors.ts";
import { Vector } from "../geometry/vector.ts";
import { fromVec3 } from "./conversions.ts";
import { native } from "./kernel.ts";
import { extrudeWire } from "./makers/extrude.ts";
import { makeLoftShell } from "./makers/loft.ts";
import { revolveShell } from "./makers/revolve.ts";
import { sweepShell } from "./makers/sweep.ts";
import { Mixin2D } from "./mixin2d.ts";
import { registerShapeConstructor } from "./registry.ts";

/** Faces joined along shared edges (build123d `Shell`). */
export class Shell extends Mixin2D {
    static override readonly order: number = 2.5;

    /** Wrap a native shell. */
    constructor(wrapped: occt.Shape, options?: ShapeOptions);
    /** The shell `faces` sew into, or the one-face shell of a single face. */
    constructor(faces: Face | Iterable<Face>, options?: ShapeOptions);
    constructor(source: occt.Shape | Face | Iterable<Face>, options: ShapeOptions = {}) {
        super(shellOf(source), options);
    }

    /** The shell a wire sweeps out when extruded (build123d `Shell.extrude`). */
    static extrude(profile: Wire, direction: VectorLike): Shell {
        return extrudeWire(profile, direction);
    }

    /**
     * The shell skinned through the sections; vertices may only cap the run, and the wires may
     * be open (build123d `Shell.make_loft`).
     */
    static makeLoft(objs: Iterable<Vertex | Wire>, options?: LoftOptions): Shell {
        return makeLoftShell(objs, options);
    }

    /** Revolve a 1D profile `angle` degrees about `axis`. */
    static revolve(profile: Shape, angle: number, axis: Axis): Shell {
        return revolveShell(profile, angle, axis);
    }

    /** Sweep a 1D profile along a 1D path; the result may be non-planar. */
    static sweep(
        profile: Shape,
        path: Shape,
        options?: { readonly transition?: Transition },
    ): Shell {
        return sweepShell(profile, path, options);
    }

    /**
     * Volume enclosed by a closed shell; 0 for an open one. build123d first rebuilds a solid
     * from a manifold shell (ShapeFix_Solid); this integrates the closed shell directly, which
     * agrees for consistently oriented shells.
     */
    get volume(): number {
        if (!query.isClosed(this.wrapped)) {
            return 0;
        }
        return native("Volume", () => measure.massProperties(this.wrapped, "volume").mass);
    }

    /**
     * build123d's shell centre: the centre of mass of its edges (`LinearProperties`), not of
     * its surface.
     */
    center(): Vector {
        let properties = native("Center of mass", () =>
            measure.massProperties(this.wrapped, "linear"),
        );
        return fromVec3(properties.centerOfMass);
    }

    /** Placement on the face nearest `surfacePoint` (build123d `Shell.location_at`). */
    locationAt(surfacePoint: VectorLike, options: SurfaceLocationOptions = {}): Location {
        let nearest = this.faces().sortBy(face => face.distanceTo(surfacePoint)).first;
        return nearest.locationAt(surfacePoint, options);
    }
}

registerShapeConstructor(ShapeType.Shell, wrapped => new Shell(wrapped));

/** build123d `Shell(faces)`: a single face is wrapped, several are sewn together. */
function shellOf(source: occt.Shape | Face | Iterable<Face>): occt.Shape {
    if (!(Symbol.iterator in source) && !("shapeType" in source)) {
        return source;
    }
    let faces = "shapeType" in source ? [source] : [...(source as Iterable<Face>)];
    if (faces.length === 0) {
        throw new InvalidShapeError("Cannot create a Shell without faces");
    }
    let sewn = native("Shell construction", () =>
        construct.sewFaces(faces.map(face => face.wrapped)),
    );
    if (shapes.shapeType(sewn) !== ShapeType.Shell) {
        throw new InvalidShapeError("The faces given do not sew into a single shell");
    }
    return sewn;
}
