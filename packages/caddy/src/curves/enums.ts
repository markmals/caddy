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
