/** Alignment of an object about one axis (build123d `Align`). */
export const Align = {
    Min: "MIN",
    Center: "CENTER",
    Max: "MAX",
    None: "NONE",
} as const;

export type Align = (typeof Align)[keyof typeof Align];

/** Per-axis alignment in 2D; a single value applies to every axis. */
export type Align2DLike = Align | null | readonly [Align | null, Align | null];

/** Per-axis alignment in 3D; a single value applies to every axis. */
export type Align3DLike = Align | null | readonly [Align | null, Align | null, Align | null];

/**
 * Order of extrinsic rotations — each rotation is about a fixed world axis (build123d
 * `Extrinsic`).
 */
export const Extrinsic = {
    XYZ: "Extrinsic.XYZ",
    XZY: "Extrinsic.XZY",
    YZX: "Extrinsic.YZX",
    YXZ: "Extrinsic.YXZ",
    ZXY: "Extrinsic.ZXY",
    ZYX: "Extrinsic.ZYX",
    XYX: "Extrinsic.XYX",
    XZX: "Extrinsic.XZX",
    YZY: "Extrinsic.YZY",
    YXY: "Extrinsic.YXY",
    ZXZ: "Extrinsic.ZXZ",
    ZYZ: "Extrinsic.ZYZ",
} as const;

export type Extrinsic = (typeof Extrinsic)[keyof typeof Extrinsic];

/**
 * Order of intrinsic rotations — each rotation is about an axis of the frame produced by the
 * preceding rotations (build123d `Intrinsic`).
 */
export const Intrinsic = {
    XYZ: "Intrinsic.XYZ",
    XZY: "Intrinsic.XZY",
    YZX: "Intrinsic.YZX",
    YXZ: "Intrinsic.YXZ",
    ZXY: "Intrinsic.ZXY",
    ZYX: "Intrinsic.ZYX",
    XYX: "Intrinsic.XYX",
    XZX: "Intrinsic.XZX",
    YZY: "Intrinsic.YZY",
    YXY: "Intrinsic.YXY",
    ZXZ: "Intrinsic.ZXZ",
    ZYZ: "Intrinsic.ZYZ",
} as const;

export type Intrinsic = (typeof Intrinsic)[keyof typeof Intrinsic];

/** Any rotation ordering accepted where build123d accepts `Extrinsic | Intrinsic`. */
export type EulerOrdering = Extrinsic | Intrinsic;
