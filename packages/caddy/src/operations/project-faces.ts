import { booleans, features, measure, topology } from "@roonieone/occt-native";

import type { VectorLike } from "../geometry/index.ts";
import type { Compound } from "../topology/compound.ts";
import type { Edge } from "../topology/edge.ts";
import type { Face } from "../topology/face.ts";
import type { Wire } from "../topology/wire.ts";

import { GeometryError, NativeKernelError } from "../errors.ts";
import { Axis, BoundingBox, Plane, Pos, Vector } from "../geometry/index.ts";
import { ShapeList } from "../topology/shape-list.ts";
import { Shape } from "../topology/shape.ts";

/**
 * build123d `Face.project_to_shape`: extrudes the face along `direction` and keeps the parts of
 * the target it sweeps through, ordered away from the face. A target face yields faces, any
 * other target yields the shells it cuts (or their single face).
 */
export function projectFaceToShape(
    face: Face,
    target: Shape,
    direction: VectorLike,
): ShapeList<Shape> {
    if (target.shapeType === "Vertex") {
        throw new GeometryError("Projection to a vertex is not supported");
    }
    let unit = Vector.from(direction);
    let span = combinedExtent(face, target);
    let swept = Shape.cast(
        wrapped(() => features.extrude(face.wrapped, unit.multiply(span).toTuple())),
    );
    let pieces: Shape[] =
        target.shapeType === "Face"
            ? [...intersection(swept, target).faces()]
            : target.shells().flatMap(shell => [...intersection(swept, shell).shells()]);
    let along = unit.normalized();
    return new ShapeList<Shape>(
        pieces
            .map(piece => ({ piece, reach: piece.center().sub(face.center()).dot(along) }))
            .sort((first, second) => first.reach - second.reach)
            .map(entry => (entry.piece.faces().length === 1 ? entry.piece.face() : entry.piece)),
    );
}

/**
 * build123d `Shape.project_faces`: walks `path` across this shape, standing each face up on the
 * surface at the matching station and projecting it inwards.
 */
export function projectFaces(
    target: Shape,
    faces: Compound | Iterable<Face>,
    path: Edge | Wire,
    start = 0,
): ShapeList<Shape> {
    let profiles = faces instanceof Shape ? [...faces.faces()] : [...faces];
    let first = profiles[0];
    if (first === undefined) throw new GeometryError("No face to project");
    let pathLength = path.length;
    let center = target.center();
    let originX = first.boundingBox().min.x;

    return new ShapeList<Shape>(
        profiles.map(profile => {
            let box = profile.boundingBox();
            let faceX = (box.min.x + box.max.x) / 2;
            let station = start + (faceX - originX) / pathLength;
            let [surfacePoint, surfaceNormal] = surfaceHit(
                target,
                new Axis(path.positionAt(station), center.sub(path.positionAt(station))),
            );
            let standing = new Plane({
                origin: surfacePoint,
                xDir: path.tangentAt(station),
                zDir: surfaceNormal,
            });
            let upright = profile
                .moved(new Pos(-faceX, 0, 0))
                .transformShape(standing.reverseTransform);
            let landed = projectFaceToShape(upright, target, surfaceNormal.multiply(-1))[0];
            if (landed === undefined) {
                throw new GeometryError("A face did not reach the target surface");
            }
            return landed;
        }),
    );
}

/** build123d `find_max_dimension`: the diagonal of the box enclosing both shapes. */
function combinedExtent(face: Shape, target: Shape): number {
    let both = topology.makeCompound([face.wrapped, target.wrapped]);
    let bounds = wrapped(() => measure.boundingBox(both, true));
    if (bounds === undefined) throw new GeometryError("Cannot project an empty shape");
    return new BoundingBox(bounds.min, bounds.max).diagonal;
}

/** The first surface `axis` pierces, with the outward normal there. */
function surfaceHit(target: Shape, axis: Axis): [Vector, Vector] {
    let hits = wrapped(() =>
        features.axisHits(target.wrapped, {
            origin: axis.position.toTuple(),
            direction: axis.direction.toTuple(),
        }),
    );
    let face = hits.faces[0];
    let [x, y, z] = hits.points;
    if (face === undefined || x === undefined || y === undefined || z === undefined) {
        throw new GeometryError("The projection axis misses the target shape");
    }
    let point = new Vector(x, y, z);
    return [point, (Shape.cast(face) as Face).normalAt(point)];
}

function intersection(swept: Shape, target: Shape): Shape {
    return Shape.cast(wrapped(() => booleans.common([swept.wrapped], [target.wrapped])));
}

function wrapped<T>(call: () => T): T {
    try {
        return call();
    } catch (cause) {
        throw new NativeKernelError("Projection onto the target shape failed", { cause });
    }
}
