import { booleans, features } from "@roonieone/occt-native";

import type { VectorLike } from "../geometry/index.ts";
import type { Until } from "./extrude-until.ts";

import { GeometryError, NativeKernelError } from "../errors.ts";
import { Axis, Vector } from "../geometry/index.ts";
import { Part, Sketch } from "../topology/composite.ts";
import { Compound } from "../topology/compound.ts";
import { Face } from "../topology/face.ts";
import { Shape } from "../topology/shape.ts";
import { Vertex } from "../topology/vertex.ts";
import { Wire } from "../topology/wire.ts";
import { extrudeUntil } from "./extrude-until.ts";
import { loftHoleSections } from "./loft-holes.ts";
import { extrudeTaper } from "./taper.ts";

export interface ExtrudeOptions {
    readonly dir?: VectorLike;
    readonly both?: boolean;
    readonly until?: Until;
    readonly target?: Shape;
    readonly taper?: number;
    readonly clean?: boolean;
}

function makePart(solids: Shape[], clean: boolean): Part {
    let result = new Part(solids);
    return clean ? new Part(result.clean().wrapped) : result;
}

function extrudeFace(face: Face, direction: Vector, taper: number): Shape {
    return taper === 0
        ? Shape.cast(features.extrude(face.wrapped, direction.toTuple()))
        : extrudeTaper(face, direction, taper);
}

/**
 * Extrude a face, or every face of a sketch or compound, into a Part (build123d `extrude`). A
 * sketch boolean that splits returns a plain Compound, which build123d also extrudes face by face.
 */
export function extrude(
    toExtrude: Face | Compound,
    amount?: number,
    options: ExtrudeOptions = {},
): Part {
    if (amount === undefined && (options.until === undefined || options.target === undefined)) {
        throw new GeometryError("Extrusion requires an amount or both until and a target");
    }
    if (amount !== undefined && (!Number.isFinite(amount) || amount === 0)) {
        throw new GeometryError("Extrusion amount must be nonzero and finite");
    }
    if (amount !== undefined && options.until !== undefined) {
        throw new GeometryError("Extrusion cannot use both an amount and an until target");
    }
    if (amount === undefined && options.taper !== undefined && options.taper !== 0) {
        throw new GeometryError("Taper is not supported when extruding until a target");
    }
    let faces = toExtrude instanceof Face ? [toExtrude] : toExtrude.faces;
    if (faces.length === 0) throw new GeometryError("A face or sketch must be provided");
    let solids: Shape[] = [];
    for (let face of faces) {
        let direction =
            options.dir === undefined
                ? face.normalAt().normalized()
                : Vector.from(options.dir).normalized();
        try {
            let forward =
                amount === undefined
                    ? extrudeUntil(face, options.target!, direction, options.until!)
                    : extrudeFace(face, direction.multiply(amount), options.taper ?? 0);
            if (options.both) {
                let backward =
                    amount === undefined
                        ? extrudeUntil(face, options.target!, direction.negate(), options.until!)
                        : extrudeFace(face, direction.multiply(-amount), options.taper ?? 0);
                solids.push(Shape.cast(booleans.fuse([forward.wrapped], [backward.wrapped])));
            } else {
                solids.push(forward);
            }
        } catch (cause) {
            if (cause instanceof GeometryError) throw cause;
            throw new NativeKernelError("Extrusion failed", { cause });
        }
    }
    return makePart(solids, options.clean ?? true);
}

export interface RevolveOptions {
    /** Axis the profiles turn about; defaults to `Axis.Z`. */
    readonly axis?: Axis;
    /** Sweep in degrees, signed; defaults to a full turn. */
    readonly revolutionArc?: number;
    readonly clean?: boolean;
}

export function revolve(
    profiles: Face | Sketch | readonly Face[],
    options: RevolveOptions = {},
): Part {
    let { axis = Axis.Z, revolutionArc = 360, clean = true } = options;
    if (!Number.isFinite(revolutionArc)) throw new GeometryError("Revolution arc must be finite");
    let faces =
        profiles instanceof Face
            ? [profiles]
            : profiles instanceof Sketch
              ? profiles.faces
              : profiles;
    if (faces.length === 0) throw new GeometryError("Revolve requires at least one face");
    let sign = revolutionArc >= 0 ? 1 : -1;
    let arc = revolutionArc % (sign * 360) || sign * 360;
    try {
        let solids = faces.map(face =>
            Shape.cast(
                features.revolve(
                    face.wrapped,
                    {
                        origin: axis.position.toTuple(),
                        direction: axis.direction.toTuple(),
                    },
                    (arc * Math.PI) / 180,
                ),
            ),
        );
        return makePart(solids, clean);
    } catch (cause) {
        throw new NativeKernelError("Revolution failed", { cause });
    }
}

function outerSections(sections: readonly (Face | Sketch | Vertex)[]): (Vertex | Wire)[] {
    let result: (Vertex | Wire)[] = [];
    for (let section of sections) {
        if (section instanceof Vertex) result.push(section);
        else
            for (let face of section instanceof Face ? [section] : section.faces)
                result.push(face.outerWire);
    }
    return result;
}

export interface LoftOptions {
    /** Join the sections with straight ruled surfaces instead of a smooth skin. */
    readonly ruled?: boolean;
    readonly clean?: boolean;
}

export function loft(
    sections: readonly (Face | Sketch | Vertex)[],
    options: LoftOptions = {},
): Part {
    let { ruled = false, clean = true } = options;
    if (sections.length < 2 || sections.slice(1, -1).some(section => section instanceof Vertex)) {
        throw new GeometryError("Loft needs at least two sections; vertices may only be endpoints");
    }
    let wires = outerSections(sections);
    if (wires.length < 2) throw new GeometryError("Loft requires at least two wires or vertices");
    try {
        let solid = Shape.cast(
            features.loft(
                wires.map(section => section.wrapped),
                ruled,
            ),
        );
        let faces = sections.flatMap<Face>(section =>
            section instanceof Vertex
                ? []
                : section instanceof Face
                  ? [section]
                  : [...section.faces],
        );
        let holes = loftHoleSections(faces);
        if (holes.length !== 0) {
            let holeSolids = holes.map(group =>
                features.loft(
                    group.map(wire => wire.wrapped),
                    ruled,
                ),
            );
            solid = Shape.cast(booleans.cut([solid.wrapped], holeSolids));
        }
        return makePart([solid], clean);
    } catch (cause) {
        if (cause instanceof GeometryError) throw cause;
        throw new NativeKernelError("Loft failed", { cause });
    }
}
