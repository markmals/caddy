// Value types exchanged with the addon. Geometry crosses the boundary as plain numbers; only
// shapes stay native.

declare const SHAPE_BRAND: unique symbol;

/**
 * An OCCT `TopoDS_Shape` owned by JavaScript. Opaque: pass it back to this package's functions.
 * Native memory is released when the object is garbage collected, or immediately by `dispose`.
 */
export interface Shape {
    readonly [SHAPE_BRAND]: true;
}

export type Vec3 = readonly [x: number, y: number, z: number];

/** Right-handed local coordinate system (OCCT gp_Ax2): origin, main (Z) direction, X direction. */
export interface Frame {
    readonly origin: Vec3;
    readonly zDirection: Vec3;
    readonly xDirection: Vec3;
}

/** Point and direction (OCCT gp_Ax1). */
export interface Axis {
    readonly origin: Vec3;
    readonly direction: Vec3;
}

/** 3x4 row-major affine matrix `[a11, a12, a13, a14, a21, ..., a34]` (OCCT gp_Trsf / gp_GTrsf). */
export type Matrix3x4 = readonly number[];

/** OCCT TopAbs_ShapeEnum. */
export const ShapeType = {
    Compound: 0,
    CompSolid: 1,
    Solid: 2,
    Shell: 3,
    Face: 4,
    Wire: 5,
    Edge: 6,
    Vertex: 7,
    Shape: 8,
} as const;
export type ShapeType = (typeof ShapeType)[keyof typeof ShapeType];

/** OCCT TopAbs_Orientation. */
export const Orientation = { Forward: 0, Reversed: 1, Internal: 2, External: 3 } as const;
export type Orientation = (typeof Orientation)[keyof typeof Orientation];

export const WORLD_FRAME: Frame = {
    origin: [0, 0, 0],
    zDirection: [0, 0, 1],
    xDirection: [1, 0, 0],
};

export function frameArray(frame: Frame): Float64Array {
    return Float64Array.of(...frame.origin, ...frame.zDirection, ...frame.xDirection);
}

export function axisArray(axis: Axis): Float64Array {
    return Float64Array.of(...axis.origin, ...axis.direction);
}

export function matrixArray(matrix: Matrix3x4): Float64Array {
    if (matrix.length !== 12)
        throw new RangeError(`expected a 3x4 matrix (12 numbers), got ${matrix.length}`);
    return Float64Array.from(matrix);
}

export function vec3(values: Float64Array, offset = 0): Vec3 {
    return [
        values[offset] ?? Number.NaN,
        values[offset + 1] ?? Number.NaN,
        values[offset + 2] ?? Number.NaN,
    ];
}
