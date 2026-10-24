/** The kind of geometry underlying an edge or face (build123d `GeomType`). */
export const GeomType = {
    Plane: "PLANE",
    Cylinder: "CYLINDER",
    Cone: "CONE",
    Sphere: "SPHERE",
    Torus: "TORUS",
    Bezier: "BEZIER",
    Bspline: "BSPLINE",
    Revolution: "REVOLUTION",
    Extrusion: "EXTRUSION",
    Offset: "OFFSET",
    Line: "LINE",
    Circle: "CIRCLE",
    Ellipse: "ELLIPSE",
    Hyperbola: "HYPERBOLA",
    Parabola: "PARABOLA",
    Other: "OTHER",
} as const;

export type GeomType = (typeof GeomType)[keyof typeof GeomType];

/** Measures that `ShapeList#sortBy` and `ShapeList#groupBy` order by (build123d `SortBy`). */
export const SortBy = {
    Length: "LENGTH",
    Radius: "RADIUS",
    Area: "AREA",
    Volume: "VOLUME",
    Distance: "DISTANCE",
} as const;

export type SortBy = (typeof SortBy)[keyof typeof SortBy];

/** Which side(s) of a split to keep (build123d `Keep`). */
export const Keep = {
    All: "ALL",
    Bottom: "BOTTOM",
    Both: "BOTH",
    Inside: "INSIDE",
    Outside: "OUTSIDE",
    Top: "TOP",
} as const;

export type Keep = (typeof Keep)[keyof typeof Keep];

/** How a shape's centre is computed (build123d `CenterOf`). */
export const CenterOf = {
    Geometry: "GEOMETRY",
    Mass: "MASS",
    BoundingBox: "BOUNDING_BOX",
} as const;

export type CenterOf = (typeof CenterOf)[keyof typeof CenterOf];

/** Whether a position along a curve is a normalized parameter or an arc length. */
export const PositionMode = {
    Length: "LENGTH",
    Parameter: "PARAMETER",
} as const;

export type PositionMode = (typeof PositionMode)[keyof typeof PositionMode];

/** Moving frame used by locations along edges and wires. */
export const FrameMethod = {
    Frenet: "FRENET",
    Corrected: "CORRECTED",
} as const;
export type FrameMethod = (typeof FrameMethod)[keyof typeof FrameMethod];

/**
 * How the material of a shape sits around one of its elements (build123d `Convexity`): a
 * property of the element and the shape it was selected from, not of the element alone.
 */
export const Convexity = {
    /** The material closes around the element by less than half a turn: a box's outer edge. */
    Convex: "CONVEX",
    /** By more than half a turn: the inner corner of a pocket, a hole. */
    Concave: "CONCAVE",
    /** The boundary passes through without bending: a planar face, a fillet seam. */
    Smooth: "SMOOTH",
    /** Both senses are present along the element. */
    Saddle: "SADDLE",
} as const;
export type Convexity = (typeof Convexity)[keyof typeof Convexity];

/** build123d's names for the OCCT shape types, as `Shape#shapeType` reports them. */
export type ShapeTypeName =
    | "Vertex"
    | "Edge"
    | "Wire"
    | "Face"
    | "Shell"
    | "Solid"
    | "CompSolid"
    | "Compound";
