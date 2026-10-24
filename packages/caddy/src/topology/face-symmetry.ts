/** Mirror axes of a planar face (build123d `Face.axes_of_symmetry`). */

import { obb } from "@roonieone/occt-native";

import type { Shape } from "./shape.ts";

import { GeometryError } from "../errors.ts";
import { Axis } from "../geometry/axis.ts";
import { OrientedBoundBox } from "../geometry/oriented-bound-box.ts";
import { Plane } from "../geometry/plane.ts";
import { Vector } from "../geometry/vector.ts";
import { Edge } from "./edge.ts";
import { GeomType, Keep } from "./enums.ts";
import { Face } from "./face.ts";
import { ShapeList } from "./shape-list.ts";

/** build123d's `TOLERANCE`. */
const TOLERANCE = 1e-6;

/**
 * The axes a planar face mirrors onto itself about, through its centre of mass. Candidate
 * directions come from the holes' centres when the face has holes, and otherwise from points
 * along its outer wire (plus its oriented bounding box when any edge is curved); each candidate
 * is kept when the face's two halves match after mirroring.
 */
export function axesOfSymmetry(face: Face): Axis[] {
    if (face.isPlanar === undefined) {
        throw new GeometryError("axes_of_symmetry only supports for planar faces");
    }
    let center = face.center();
    let normal = face.normalAt();
    let symmetryDirections: Vector[] = [];
    for (let direction of candidateDirections(face, center)) {
        if (!isSymmetryDirection(face, center, normal, direction)) {
            continue;
        }
        let opposite = symmetryDirections.some(kept => kept.dot(direction) < -1 + TOLERANCE);
        if (!opposite && !symmetryDirections.some(kept => kept.equals(direction))) {
            symmetryDirections.push(direction);
        }
    }
    return symmetryDirections.map(direction => new Axis(center, direction));
}

function candidateDirections(face: Face, center: Vector): Vector[] {
    let holes = face.innerWires();
    if (holes.length > 0) {
        let holeFaces = holes.map(wire => new Face(wire));
        let holesCenter = combinedCenter(holeFaces);
        if (holesCenter.sub(center).length > TOLERANCE) {
            return [holesCenter.sub(center).normalized()];
        }
        return holeFaces.map(hole => hole.center().sub(center).normalized());
    }
    let outerEdges = face.outerWire().edges();
    let sampled = [...outerEdges];
    if (outerEdges.some(edge => edge.geomType !== GeomType.Line)) {
        let bounds = obb.orientedBoundingBox(face.wrapped);
        if (bounds === undefined) {
            throw new GeometryError("Can't determine the oriented bounding box of the face");
        }
        let corners = new OrientedBoundBox(bounds).corners;
        sampled.push(
            ...[0, 1, 2, 3].map(index => Edge.makeLine(corners[index]!, corners[(index + 1) % 4]!)),
        );
    }
    return sampled
        .flatMap(edge => [0, 0.5, 1].map(parameter => edge.positionAt(parameter)))
        .map(point => point.sub(center).normalized());
}

/** Centre of mass of several faces together (build123d `Shape.combined_center`). */
function combinedCenter(faces: readonly Face[]): Vector {
    let totalArea = faces.reduce((sum, face) => sum + face.area, 0);
    if (totalArea === 0) {
        throw new GeometryError("No area to combine");
    }
    return faces
        .reduce((sum, face) => sum.add(face.center().multiply(face.area)), new Vector())
        .multiply(1 / totalArea);
}

/** Whether mirroring the face's upper half across the candidate plane reproduces its lower half. */
function isSymmetryDirection(
    face: Face,
    center: Vector,
    normal: Vector,
    direction: Vector,
): boolean {
    let splitPlane = new Plane({
        origin: center,
        xDir: direction,
        zDir: direction.cross(normal),
    });
    let [top, bottom] = face.split(splitPlane, Keep.Both);
    if (top === undefined || bottom === undefined) {
        return false;
    }
    let axis = new Axis(center, direction);
    let bottomFaces = new ShapeList(bottom.faces()).sortBy(axis);
    let topFaces = new ShapeList(top.faces().map(part => part.mirror(splitPlane))).sortBy(axis);
    if (topFaces.length !== bottomFaces.length) {
        return false;
    }
    let bottomArea = bottomFaces.reduce((sum, part) => sum + part.area, 0);
    let overlapArea = 0;
    for (let [index, flipped] of topFaces.entries()) {
        let overlap = flipped.intersect(bottomFaces[index]!);
        if (overlap === undefined) {
            return false;
        }
        overlapArea += overlap.faces().reduce((sum: number, part: Shape) => sum + part.area, 0);
    }
    return Math.abs(overlapArea - bottomArea) < TOLERANCE;
}
