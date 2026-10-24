/** How an offset or fillet joins two segments at a corner (build123d `Kind`). */
export const Kind = {
    Arc: "ARC",
    Intersection: "INTERSECTION",
    Tangent: "TANGENT",
} as const;

export type Kind = (typeof Kind)[keyof typeof Kind];

/** Which side of a line an offset is placed on (build123d `Side`). */
export const Side = {
    Both: "BOTH",
    Left: "LEFT",
    Right: "RIGHT",
} as const;

export type Side = (typeof Side)[keyof typeof Side];
