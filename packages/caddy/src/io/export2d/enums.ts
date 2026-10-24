// Enumerations the 2D exporters take as options (build123d `ApproxOption`, `ColorIndex`,
// `DotLength`, `PageSize`).

/**
 * How a DXF export approximates a spline (build123d `ApproxOption`).
 *
 * build123d 0.13.0 declares this enum but never reads it: `ExportDXF` always writes a B-spline
 * entity, so Caddy ships the enum without a setting that takes it rather than inventing a
 * behaviour the oracle cannot confirm.
 */
export const ApproxOption = {
    Arc: "ARC",
    None: "NONE",
    Spline: "SPLINE",
} as const;
export type ApproxOption = (typeof ApproxOption)[keyof typeof ApproxOption];

/** AutoCAD colour index, the only colour model DXF layers carry. */
export const ColorIndex = {
    Red: 1,
    Yellow: 2,
    Green: 3,
    Cyan: 4,
    Blue: 5,
    Magenta: 6,
    Black: 7,
    Gray: 8,
    LightGray: 9,
} as const;
export type ColorIndex = (typeof ColorIndex)[keyof typeof ColorIndex];

/** Width rendered for a dash pattern's dots, in tenths of an inch. */
export const DotLength = {
    /** A true, circular dot, which renders properly in web browsers. */
    TrueDot: 0,
    /** A very short segment, which Inkscape renders but still looks like a circle. */
    InkscapeCompat: 0.01,
    /** A visibly elongated dot matching QCAD's rendering of imperial documents. */
    QcadImperial: 0.2,
} as const;
export type DotLength = (typeof DotLength)[keyof typeof DotLength];

/** Paper size of a technical drawing. */
export const PageSize = {
    A0: "A0",
    A1: "A1",
    A2: "A2",
    A3: "A3",
    A4: "A4",
    A5: "A5",
    A6: "A6",
    A7: "A7",
    A8: "A8",
    A9: "A9",
    A10: "A10",
    Letter: "LETTER",
    Legal: "LEGAL",
    Ledger: "LEDGER",
} as const;
export type PageSize = (typeof PageSize)[keyof typeof PageSize];

/** Landscape page dimensions `[width, height]` in millimetres. */
export const PAGE_SIZES: Readonly<Record<PageSize, readonly [number, number]>> = {
    [PageSize.A0]: [1189, 841],
    [PageSize.A1]: [841, 594],
    [PageSize.A2]: [594, 420],
    [PageSize.A3]: [420, 297],
    [PageSize.A4]: [297, 210],
    [PageSize.A5]: [210, 148.5],
    [PageSize.A6]: [148.5, 105],
    [PageSize.A7]: [105, 74],
    [PageSize.A8]: [74, 52],
    [PageSize.A9]: [52, 37],
    [PageSize.A10]: [37, 26],
    [PageSize.Letter]: [11 * 25.4, 8.5 * 25.4],
    [PageSize.Legal]: [14 * 25.4, 8.5 * 25.4],
    [PageSize.Ledger]: [17 * 25.4, 11 * 25.4],
};
