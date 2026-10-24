/** Direction an arc is swept in (build123d `AngularDirection`). */
export const AngularDirection = {
    Clockwise: "CLOCKWISE",
    CounterClockwise: "COUNTER_CLOCKWISE",
} as const;

export type AngularDirection = (typeof AngularDirection)[keyof typeof AngularDirection];

/** Which leg of the triangle a {@link PolarLine} length measures (build123d `LengthMode`). */
export const LengthMode = {
    Diagonal: "DIAGONAL",
    Horizontal: "HORIZONTAL",
    Vertical: "VERTICAL",
} as const;

export type LengthMode = (typeof LengthMode)[keyof typeof LengthMode];

/**
 * How a solution curve must sit against a tangency target (build123d `Tangency`, OCCT
 * `GccEnt_Position`): unqualified accepts either side, enclosing keeps the target inside the
 * solution, enclosed keeps the solution inside the target and outside keeps them apart.
 */
export const Tangency = {
    Unqualified: "UNQUALIFIED",
    Enclosing: "ENCLOSING",
    Enclosed: "ENCLOSED",
    Outside: "OUTSIDE",
} as const;

export type Tangency = (typeof Tangency)[keyof typeof Tangency];

/** Which of the two arcs between a pair of contacts a solver keeps (build123d `Sagitta`). */
export const Sagitta = {
    Short: "SHORT",
    Long: "LONG",
    Both: "BOTH",
} as const;

export type Sagitta = (typeof Sagitta)[keyof typeof Sagitta];

/** Smoothness two curves meet with: position, tangent or curvature (build123d `ContinuityLevel`). */
export const ContinuityLevel = {
    C0: "C0",
    C1: "C1",
    C2: "C2",
} as const;

export type ContinuityLevel = (typeof ContinuityLevel)[keyof typeof ContinuityLevel];
