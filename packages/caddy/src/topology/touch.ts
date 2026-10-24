import { construct, query } from "@roonieone/occt-native";

import type { Edge } from "./edge.ts";
import type { Face } from "./face.ts";
import type { Mixin2D } from "./mixin2d.ts";
import type { Shape } from "./shape.ts";
import type { Vertex } from "./vertex.ts";

import { booleanPieces } from "./boolean.ts";
import { fromVec3, toVec3 } from "./conversions.ts";
import { native } from "./kernel.ts";
import { castShape } from "./registry.ts";
import { ShapeList } from "./shape-list.ts";

/** Keeps near-coincident extrema solutions apart, as build123d's `SetDeflection` does. */
const DEFLECTION_FACTOR = 1e-3;
/** Normals this close in direction count as the same when comparing two faces. */
const NORMAL_AGREEMENT = 0.99;
/** Side of the parameter grid two faces are compared on. */
const FACE_GRID = 4;

/** The pre-found intersection results a touch search filters its candidates against. */
export interface TouchFilter {
    readonly faces: readonly Face[];
    readonly edges: readonly Edge[];
}

function isOn(vertex: Vertex, shape: Shape, tolerance: number): boolean {
    return vertex.distanceTo(shape) <= tolerance;
}

function isOnAny(vertex: Vertex, candidates: Iterable<Shape>, tolerance: number): boolean {
    return [...candidates].some(candidate => isOn(vertex, candidate, tolerance));
}

function samePosition(vertex: Vertex, others: Iterable<Shape>): boolean {
    let point = vertex.center;
    return [...others].some(other => point.equals(other.center));
}

/** Points where two shapes meet within `tolerance`, each one at a single location. */
function contactPoints(first: Shape, second: Shape, tolerance: number): Vertex[] {
    let solutions = native("Boundary contacts", () =>
        query.extremaSolutions(first.wrapped, second.wrapped, tolerance * DEFLECTION_FACTOR),
    );
    let contacts: Vertex[] = [];
    for (let { onFirst, onSecond } of solutions) {
        let point = fromVec3(onFirst);
        if (point.sub(fromVec3(onSecond)).length > tolerance) continue;
        let vertex = castShape(
            native("Contact point", () => construct.makeVertex(toVec3(point))),
        ) as Vertex;
        if (!samePosition(vertex, contacts)) contacts.push(vertex);
    }
    return contacts;
}

/**
 * Boundary contacts between a 2D shape and another (build123d `Mixin2D.touch`): the corners and
 * crossings where two faces meet without sharing an area or a curve. `found` holds the
 * intersection results the contacts are filtered against; it is computed here when omitted.
 */
export function touch2D(
    self: Mixin2D,
    other: Shape,
    tolerance: number,
    found?: TouchFilter,
): ShapeList<Shape> {
    if (other.shapeType !== "Face" && other.shapeType !== "Shell") {
        return other.touch(self, { tolerance });
    }
    let filter = found ?? intersectionFilter(self, other, tolerance);
    let results: Vertex[] = [];
    for (let contact of contactPoints(self, other, tolerance)) {
        if (isCrossing(contact, self, other, tolerance)) continue;
        if (
            !isOnAny(contact, filter.faces, tolerance) &&
            !isOnAny(contact, filter.edges, tolerance)
        ) {
            results.push(contact);
        }
    }
    return new ShapeList<Shape>(results);
}

/** Where two edges cross without either shape having a corner there. */
function isCrossing(contact: Vertex, self: Shape, other: Shape, tolerance: number): boolean {
    return (
        isOnAny(contact, self.edges, tolerance) &&
        isOnAny(contact, other.edges, tolerance) &&
        !samePosition(contact, self.vertices) &&
        !samePosition(contact, other.vertices)
    );
}

function intersectionFilter(self: Shape, other: Shape, tolerance: number): TouchFilter {
    let found = self.intersectWith(other, { tolerance }) ?? [];
    return {
        faces: found.filter(shape => shape.shapeType === "Face") as Face[],
        edges: found.filter(shape => shape.shapeType === "Edge") as Edge[],
    };
}

/**
 * Boundary contacts between a solid and another shape (build123d `Solid.touch`): the faces,
 * edges and vertices where the boundaries meet without their interiors overlapping.
 */
export function touch3D(
    self: Shape,
    other: Shape,
    tolerance: number,
    foundSolids?: readonly Shape[],
): ShapeList<Shape> {
    switch (other.shapeType) {
        case "Solid":
        case "Face":
        case "Shell":
            return maximalContacts(self, other, tolerance, foundSolids);
        case "Edge":
        case "Wire":
            return new ShapeList<Shape>(curveContacts(self, other, tolerance));
        case "Vertex":
            return new ShapeList<Shape>(
                [...self.faces].some(face => isOn(other as Vertex, face, tolerance)) ? [other] : [],
            );
        default:
            return other.touch(self, { tolerance });
    }
}

/** Contacts between every pair of faces, keeping only the highest-dimensional one per place. */
function maximalContacts(
    self: Shape,
    other: Shape,
    tolerance: number,
    foundSolids: readonly Shape[] | undefined,
): ShapeList<Shape> {
    let intersectFaces =
        other.shapeType === "Solid"
            ? (foundSolids ?? self.intersectWith(other, { tolerance }) ?? []).flatMap(solid => [
                  ...solid.faces,
              ])
            : [];
    let found: Shape[] = [];
    for (let mine of self.faces) {
        for (let theirs of other.faces) {
            if (!overlapping(mine, theirs, tolerance)) continue;
            for (let contact of mine.touch(theirs, { tolerance })) {
                if (
                    isNewContact(contact, found, tolerance) &&
                    !isOnAny(contact as Vertex, intersectFaces, tolerance)
                ) {
                    found.push(contact);
                }
            }
            for (let shared of mine.intersectWith(theirs, { tolerance }) ?? []) {
                if (isNewContact(shared, found, tolerance) && !sharesArea(shared, intersectFaces)) {
                    found.push(shared);
                }
            }
        }
    }
    return new ShapeList<Shape>(keepHighestDimension(found, tolerance));
}

function overlapping(first: Shape, second: Shape, tolerance: number): boolean {
    return first
        .getBoundingBox({ optimal: false })
        .intersects(second.getBoundingBox({ optimal: false }), tolerance);
}

/** Endpoints and tangencies where a curve meets a solid's boundary. */
function curveContacts(self: Shape, other: Shape, tolerance: number): Shape[] {
    let faces = [...self.faces];
    let found: Shape[] = [];
    for (let vertex of other.vertices) {
        if (faces.some(face => isOn(vertex, face, tolerance))) found.push(vertex);
    }
    for (let face of faces) {
        if (!overlapping(face, other, tolerance)) continue;
        for (let contact of contactPoints(face, other, tolerance)) {
            if (!samePosition(contact, found)) found.push(contact);
        }
    }
    return found;
}

/** Whether `shape` is not already among `found`, comparing geometry rather than identity. */
function isNewContact(shape: Shape, found: readonly Shape[], tolerance: number): boolean {
    if (shape.shapeType === "Vertex") {
        return !samePosition(
            shape as Vertex,
            found.filter(seen => seen.shapeType === "Vertex"),
        );
    }
    if (shape.shapeType === "Edge") {
        return !found.some(
            seen =>
                seen.shapeType === "Edge" && (shape as Edge).geomEqual(seen as Edge, { tolerance }),
        );
    }
    if (shape.shapeType === "Face") {
        return !found.some(
            seen =>
                seen.shapeType === "Face" && sameSurface(shape as Face, seen as Face, tolerance),
        );
    }
    return false;
}

/** Whether a contact edge lies on one of the faces bounding an intersection solid. */
function sharesArea(shape: Shape, faces: readonly Face[]): boolean {
    if (shape.shapeType !== "Edge") return false;
    return faces.some(face => booleanPieces(shape, [shape], [face], "common").length > 0);
}

/**
 * Whether two faces are geometrically equal, sampling position and normal over a grid in their
 * parameter spaces as build123d does for speed.
 */
function sameSurface(first: Face, second: Face, tolerance: number): boolean {
    if (!overlapping(first, second, tolerance)) return false;
    for (let row = 0; row < FACE_GRID; row++) {
        for (let column = 0; column < FACE_GRID; column++) {
            let u = row / (FACE_GRID - 1);
            let v = column / (FACE_GRID - 1);
            let point = first.positionAt(u, v).sub(second.positionAt(u, v));
            let agreement = first.normalAt(u, v).dot(second.normalAt(u, v));
            if (point.length > tolerance || Math.abs(agreement) < NORMAL_AGREEMENT) return false;
        }
    }
    return true;
}

/** Drop contacts that bound a higher-dimensional contact at the same place. */
function keepHighestDimension(found: readonly Shape[], tolerance: number): Shape[] {
    let faces = found.filter(shape => shape.shapeType === "Face");
    let edges = found.filter(shape => shape.shapeType === "Edge");
    return found.filter(shape => {
        if (shape.shapeType === "Face") return true;
        if (shape.shapeType === "Edge") return !sharesArea(shape, faces as Face[]);
        if (shape.shapeType === "Vertex") {
            return (
                !isOnAny(shape as Vertex, faces, tolerance) &&
                !isOnAny(shape as Vertex, edges, tolerance)
            );
        }
        return false;
    });
}
