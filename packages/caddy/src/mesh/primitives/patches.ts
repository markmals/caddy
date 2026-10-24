/**
 * The fitted primitives the detectors produce, and the analytic faces they turn into.
 *
 * A patch is the fit plus the mesh faces that support it; nothing here touches the kernel until
 * a patch is realised as a `Face`, which keeps the search loops cheap.
 */

import type { Vector } from "../../geometry/vector.ts";
import type { Face } from "../../topology/face.ts";

import { Align } from "../../geometry/enums.ts";
import { Pos } from "../../geometry/location.ts";
import { Plane } from "../../geometry/plane.ts";
import { Cylinder, Sphere } from "../../parts/primitives.ts";
import { Rectangle } from "../../sketch/objects/rectangles.ts";
import { GeomType } from "../../topology/enums.ts";
import { uniqueFaceVertices } from "./mesh-index.ts";
import { EPS, median, planeBasis } from "./numeric.ts";

/** A plane fitted to a set of mesh faces, with the patch's extent in its own basis. */
export interface PlanePatch {
    readonly kind: "plane";
    readonly faceIndices: ReadonlySet<number>;
    readonly origin: Vector;
    readonly normal: Vector;
    readonly uMin: number;
    readonly uMax: number;
    readonly vMin: number;
    readonly vMax: number;
    readonly residual: number;
}

/** A cylinder fitted to a set of mesh faces. */
export interface CylinderPatch {
    readonly kind: "cylinder";
    readonly faceIndices: ReadonlySet<number>;
    readonly axisPoint: Vector;
    readonly axisDirection: Vector;
    readonly radius: number;
    /** `1` when the mesh normals point away from the axis, `-1` when they point at it. */
    readonly normalSign: 1 | -1;
    readonly residual: number;
}

/** A sphere fitted to a set of mesh faces. */
export interface SpherePatch {
    readonly kind: "sphere";
    readonly faceIndices: ReadonlySet<number>;
    readonly center: Vector;
    readonly radius: number;
    readonly residual: number;
}

export type DetectedPatch = PlanePatch | CylinderPatch | SpherePatch;

/** The planar face a plane patch stands for: its fitted extent, as a rectangle. */
export function buildPlaneFace(patch: PlanePatch): Face {
    let uSize = patch.uMax - patch.uMin;
    let vSize = patch.vMax - patch.vMin;
    let uCenter = (patch.uMin + patch.uMax) / 2;
    let vCenter = (patch.vMin + patch.vMax) / 2;
    let [uVector] = planeBasis(patch.normal);
    let plane = new Plane({ origin: patch.origin, xDir: uVector, zDir: patch.normal });
    return new Rectangle(uSize, vSize).moved(plane.transform(new Pos(uCenter, vCenter, 0))).face;
}

/** The cylindrical face a cylinder patch stands for, trimmed to the support faces' extent. */
export function buildCylinderFace(patch: CylinderPatch, supportFaces: readonly Face[]): Face {
    let vertices = uniqueFaceVertices(supportFaces);
    let axisValues = vertices.map(vertex => vertex.sub(patch.axisPoint).dot(patch.axisDirection));
    let radialDistances: number[] = [];
    for (let vertex of vertices) {
        let offset = vertex.sub(patch.axisPoint);
        let radial = offset.sub(patch.axisDirection.multiply(offset.dot(patch.axisDirection)));
        if (radial.length <= EPS) continue;
        radialDistances.push(radial.length);
    }
    let axisMin = Math.min(...axisValues);
    let axisMax = Math.max(...axisValues);
    let radius = median(radialDistances);
    let base = new Plane({
        origin: patch.axisPoint.add(patch.axisDirection.multiply(axisMin)),
        zDir: patch.axisDirection,
    });
    let cylinder = new Cylinder(radius, axisMax - axisMin, { align: Align.None }).moved(base);
    let [side] = cylinder.faces.filter(GeomType.Cylinder);
    if (side === undefined) {
        throw new Error("Expected a cylindrical face while building a cylinder primitive");
    }
    return patch.normalSign > 0 ? side : side.reverseNormal();
}

/** The spherical face a sphere patch stands for. */
export function buildSphereFace(patch: SpherePatch, supportFaces: readonly Face[]): Face {
    let vertices = uniqueFaceVertices(supportFaces);
    let radius = median(vertices.map(vertex => vertex.sub(patch.center).length));
    return new Sphere(radius).moved(new Pos(patch.center)).face;
}
