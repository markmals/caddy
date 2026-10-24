/** Enumerations the drafting objects take (build123d `HeadType`, `NumberDisplay`). */

/** The outline of an arrow head (build123d `HeadType`). */
export const HeadType = {
    /** Two straight sides meeting at the tip. */
    Straight: "STRAIGHT",
    /** Sides that sweep back from the tip, the default. */
    Curved: "CURVED",
    /** Curved sides with the tail corners rounded off. */
    Filleted: "FILLETED",
} as const;
export type HeadType = (typeof HeadType)[keyof typeof HeadType];

/** How a measurement is written out (build123d `NumberDisplay`). */
export const NumberDisplay = {
    Decimal: "DECIMAL",
    /** Imperial fractions of an inch; metric units always display as decimals. */
    Fraction: "FRACTION",
} as const;
export type NumberDisplay = (typeof NumberDisplay)[keyof typeof NumberDisplay];
