import { features } from "@roonieone/occt-native";

import type { VectorLike } from "../geometry/index.ts";

import { GeometryError, InvalidShapeError, NativeKernelError } from "../errors.ts";
import { Plane, Vector } from "../geometry/index.ts";
import { Kind } from "../sketch/enums.ts";
import { Compound, Face, Part, Shape, Solid } from "../topology/index.ts";
import { makeComposite } from "../topology/registry.ts";
import { offsetFace } from "./offset-face.ts";
import { offsetSolid } from "./offset-solid.ts";

export interface OffsetOptions {
    /** Faces of the offset solids to leave open, turning the offset into a shell. */
    readonly openings?: Face | readonly Face[];
    readonly kind?: Kind;
    readonly tolerance?: number;
}

/** The faces and solids `shape` contributes to an offset, as build123d sorts its operands. */
function offsetOperands(shape: Shape): { faces: Face[]; solids: Solid[] } {
    if (shape instanceof Compound) {
        return { faces: shape.getType(Face), solids: shape.getType(Solid) };
    }
    if (shape instanceof Face) return { faces: [shape], solids: [] };
    if (shape instanceof Solid) return { faces: [], solids: [shape] };
    throw new InvalidShapeError(`Offset does not support a ${shape.shapeType}`);
}

/**
 * Grow or shrink `shape` by `amount` (build123d `offset`): faces are offset in their own plane,
 * solids are offset in space. `openings` names faces of the solids to leave open, which turns the
 * offset into a shell of thickness `amount`.
 */
export function offset(shape: Shape, amount: number, options: OffsetOptions = {}): Shape {
    if (!Number.isFinite(amount) || amount === 0) {
        throw new GeometryError("Offset amount must be nonzero and finite");
    }
    let kind = options.kind ?? Kind.Arc;
    let openings =
        options.openings === undefined
            ? []
            : options.openings instanceof Face
              ? [options.openings]
              : [...options.openings];
    let { faces, solids } = offsetOperands(shape);
    if (solids.length > 0 && kind === Kind.Tangent) {
        throw new GeometryError("Tangent offset joins are not supported for solids");
    }
    let offsetFaces = faces.map(face => offsetFace(face, amount, kind));
    let offsetSolids = solids.map(solid =>
        offsetSolid(solid, amount, openingsOf(solid, openings), kind, options.tolerance ?? 1e-4),
    );
    return makeComposite([...offsetFaces, ...offsetSolids], shape.dimension);
}

/** build123d offsets each solid with only the openings that belong to it. */
function openingsOf(solid: Solid, openings: readonly Face[]): Face[] {
    if (openings.length === 0) return [];
    let own = solid.faces();
    return openings.filter(opening => own.some(face => face.isSame(opening)));
}

export interface ThickenOptions {
    /** Which way is "up"; the face normal is flipped to agree with it. */
    readonly normalOverride?: VectorLike;
    readonly both?: boolean;
    readonly clean?: boolean;
}

/** Solids of thickness `amount` grown along the normals of `toThicken` (build123d `thicken`). */
export function thicken(
    toThicken: Face | Shape | readonly Face[],
    amount: number,
    options: ThickenOptions = {},
): Part {
    if (!Number.isFinite(amount) || amount === 0) {
        throw new GeometryError("Thickness must be nonzero and finite");
    }
    let faces = Array.isArray(toThicken)
        ? (toThicken as readonly Face[])
        : toThicken instanceof Face
          ? [toThicken]
          : [...(toThicken as Shape).faces()];
    if (faces.length === 0) throw new InvalidShapeError("A face or sketch must be provided");
    let directions = options.both ? [1, -1] : [1];
    let solids = faces.flatMap(face => {
        let up =
            options.normalOverride === undefined
                ? face.normalAt()
                : Vector.from(options.normalOverride);
        return directions.map(direction => thickenFace(face, amount, up.multiply(direction)));
    });
    let [first, ...rest] = solids;
    if (first === undefined) throw new InvalidShapeError("A face or sketch must be provided");
    let fused = rest.length === 0 ? first : first.fuse(rest);
    return new Part([options.clean === false ? fused : fused.clean()]);
}

/** build123d `Solid.thicken`: the depth follows `up`, so a face pointing away is thickened back. */
function thickenFace(face: Face, depth: number, up: Vector): Shape {
    let normal = face.normalAt(face.center()).normalized();
    let adjusted = normal.dot(up.normalized()) < 0 ? -depth : depth;
    try {
        return Shape.cast(features.thicken(face.wrapped, adjusted));
    } catch (cause) {
        throw new NativeKernelError("Thicken failed", { cause });
    }
}

/** Taper `faces` of a solid by `angle` degrees about `neutralPlane` (build123d `draft`). */
export function draft(
    faces: Face | Iterable<Face>,
    neutralPlane: Plane,
    angle: number,
    parent?: Shape,
): Part {
    let selection = faces instanceof Face ? [faces] : [...faces];
    if (selection.length === 0) throw new InvalidShapeError("Draft requires one or more faces");
    let solid = parent ?? selection[0]!.topoParent;
    if (
        solid === undefined ||
        solid.solids().length !== 1 ||
        selection.some(face => face.topoParent !== solid)
    ) {
        throw new InvalidShapeError("All drafted faces must belong to one solid parent");
    }
    if (!Number.isFinite(angle)) throw new GeometryError("Draft angle must be finite");
    try {
        let frame = {
            origin: neutralPlane.origin.toTuple(),
            zDirection: neutralPlane.zDir.toTuple(),
            xDirection: neutralPlane.xDir.toTuple(),
        };
        let result = features.draft(
            solid.wrapped,
            selection.map(face => face.wrapped),
            frame,
            (angle * Math.PI) / 180,
        );
        return new Part([Shape.cast(result)]);
    } catch (cause) {
        throw new NativeKernelError("Draft failed", { cause });
    }
}
