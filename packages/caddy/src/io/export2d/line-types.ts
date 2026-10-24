// Dash patterns shared by the DXF and SVG exporters (build123d `LineType` and
// `Export2D.LINETYPE_DEFS`). Pattern values are in tenths of an inch with the total pattern
// length first, which is how DXF stores them.

import { METERS_PER_UNIT, Unit } from "../types.ts";

/** ISO/AutoCAD dash pattern applied to exported 2D lines; the value is the DXF line type name. */
export const LineType = {
    Continuous: "CONTINUOUS",
    Border: "BORDER",
    Border2: "BORDER2",
    BorderX2: "BORDERX2",
    Center: "CENTER",
    Center2: "CENTER2",
    CenterX2: "CENTERX2",
    DashDot: "DASHDOT",
    DashDot2: "DASHDOT2",
    DashDotX2: "DASHDOTX2",
    Dashed: "DASHED",
    Dashed2: "DASHED2",
    DashedX2: "DASHEDX2",
    Divide: "DIVIDE",
    Divide2: "DIVIDE2",
    DivideX2: "DIVIDEX2",
    Dot: "DOT",
    Dot2: "DOT2",
    DotX2: "DOTX2",
    Hidden: "HIDDEN",
    Hidden2: "HIDDEN2",
    HiddenX2: "HIDDENX2",
    Phantom: "PHANTOM",
    Phantom2: "PHANTOM2",
    PhantomX2: "PHANTOMX2",
    IsoDash: "ACAD_ISO02W100",
    IsoDashSpace: "ACAD_ISO03W100",
    IsoLongDashDot: "ACAD_ISO04W100",
    IsoLongDashDoubleDot: "ACAD_ISO05W100",
    IsoLongDashTripleDot: "ACAD_ISO06W100",
    IsoDot: "ACAD_ISO07W100",
    IsoLongDashShortDash: "ACAD_ISO08W100",
    IsoLongDashDoubleShortDash: "ACAD_ISO09W100",
    IsoDashDot: "ACAD_ISO10W100",
    IsoDoubleDashDot: "ACAD_ISO11W100",
    IsoDashDoubleDot: "ACAD_ISO12W100",
    IsoDoubleDashDoubleDot: "ACAD_ISO13W100",
    IsoDashTripleDot: "ACAD_ISO14W100",
    IsoDoubleDashTripleDot: "ACAD_ISO15W100",
} as const;
export type LineType = (typeof LineType)[keyof typeof LineType];

export interface LineTypeDefinition {
    readonly description: string;
    /** Total length followed by the dash/gap runs, in tenths of an inch. */
    readonly pattern: readonly number[];
}

/** ANSI patterns are specified in inches and stored in tenths of an inch. */
function ansiPattern(...runs: number[]): number[] {
    let total = runs.reduce((sum, run) => sum + Math.abs(run), 0);
    return [total, ...runs].map(run => run * 10);
}

/** ISO patterns are specified in millimetres and stored in tenths of an inch. */
function isoPattern(...runs: number[]): number[] {
    let total = runs.reduce((sum, run) => sum + Math.abs(run), 0);
    return [total, ...runs].map(run => run / 2.54);
}

export const LINETYPE_DEFS: Readonly<Record<LineType, LineTypeDefinition>> = {
    [LineType.Continuous]: { description: "Solid", pattern: [0] },
    [LineType.Border]: {
        description: "Border __ __ . __ __ . __ __ . __ __ . __ __ .",
        pattern: ansiPattern(0.5, -0.25, 0.5, -0.25, 0, -0.25),
    },
    [LineType.Border2]: {
        description: "Border (.5x) __.__.__.__.__.__.__.__.__.__.__.",
        pattern: ansiPattern(0.25, -0.125, 0.25, -0.125, 0, -0.125),
    },
    [LineType.BorderX2]: {
        description: "Border (2x) ____  ____  .  ____  ____  .  ___",
        pattern: ansiPattern(1, -0.5, 1, -0.5, 0, -0.5),
    },
    [LineType.Center]: {
        description: "Center ____ _ ____ _ ____ _ ____ _ ____ _ ____",
        pattern: ansiPattern(1.25, -0.25, 0.25, -0.25),
    },
    [LineType.Center2]: {
        description: "Center (.5x) ___ _ ___ _ ___ _ ___ _ ___ _ ___",
        pattern: ansiPattern(0.75, -0.125, 0.125, -0.125),
    },
    [LineType.CenterX2]: {
        description: "Center (2x) ________  __  ________  __  _____",
        pattern: ansiPattern(2.5, -0.5, 0.5, -0.5),
    },
    [LineType.DashDot]: {
        description: "Dash dot __ . __ . __ . __ . __ . __ . __ . __",
        pattern: ansiPattern(0.5, -0.25, 0, -0.25),
    },
    [LineType.DashDot2]: {
        description: "Dash dot (.5x) _._._._._._._._._._._._._._._.",
        pattern: ansiPattern(0.25, -0.125, 0, -0.125),
    },
    [LineType.DashDotX2]: {
        description: "Dash dot (2x) ____  .  ____  .  ____  .  ___",
        pattern: ansiPattern(1, -0.5, 0, -0.5),
    },
    [LineType.Dashed]: {
        description: "Dashed __ __ __ __ __ __ __ __ __ __ __ __ __ _",
        pattern: ansiPattern(0.5, -0.25),
    },
    [LineType.Dashed2]: {
        description: "Dashed (.5x) _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ ",
        pattern: ansiPattern(0.25, -0.125),
    },
    [LineType.DashedX2]: {
        description: "Dashed (2x) ____  ____  ____  ____  ____  ___",
        pattern: ansiPattern(1, -0.5),
    },
    [LineType.Divide]: {
        description: "Divide ____ . . ____ . . ____ . . ____ . . ____",
        pattern: ansiPattern(0.5, -0.25, 0, -0.25, 0, -0.25),
    },
    [LineType.Divide2]: {
        description: "Divide (.5x) __..__..__..__..__..__..__..__.._",
        pattern: ansiPattern(0.25, -0.125, 0, -0.125, 0, -0.125),
    },
    [LineType.DivideX2]: {
        description: "Divide (2x) ________  .  .  ________  .  .  _",
        pattern: ansiPattern(1, -0.5, 0, -0.5, 0, -0.5),
    },
    [LineType.Dot]: {
        description: "Dot . . . . . . . . . . . . . . . . . . . . . . . .",
        pattern: ansiPattern(0, -0.25),
    },
    [LineType.Dot2]: {
        description: "Dot (.5x) ........................................",
        pattern: ansiPattern(0, -0.125),
    },
    [LineType.DotX2]: {
        description: "Dot (2x) .  .  .  .  .  .  .  .  .  .  .  .  .  .",
        pattern: ansiPattern(0, -0.5),
    },
    [LineType.Hidden]: {
        description: "Hidden __ __ __ __ __ __ __ __ __ __ __ __ __ __",
        pattern: ansiPattern(0.25, -0.125),
    },
    [LineType.Hidden2]: {
        description: "Hidden (.5x) _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ ",
        pattern: ansiPattern(0.125, -0.0625),
    },
    [LineType.HiddenX2]: {
        description: "Hidden (2x) ____ ____ ____ ____ ____ ____ ____ ",
        pattern: ansiPattern(0.5, -0.25),
    },
    [LineType.Phantom]: {
        description: "Phantom ______  __  __  ______  __  __  ______ ",
        pattern: ansiPattern(1.25, -0.25, 0.25, -0.25, 0.25, -0.25),
    },
    [LineType.Phantom2]: {
        description: "Phantom (.5x) ___ _ _ ___ _ _ ___ _ _ ___ _ _",
        pattern: ansiPattern(0.625, -0.125, 0.125, -0.125, 0.125, -0.125),
    },
    [LineType.PhantomX2]: {
        description: "Phantom (2x) ____________    ____    ____   _",
        pattern: ansiPattern(2.5, -0.5, 0.5, -0.5, 0.5, -0.5),
    },
    [LineType.IsoDash]: {
        description: "ISO dash __ __ __ __ __ __ __ __ __ __ __ __ __",
        pattern: isoPattern(12, -3),
    },
    [LineType.IsoDashSpace]: {
        description: "ISO dash space __    __    __    __    __    __",
        pattern: isoPattern(12, -18),
    },
    [LineType.IsoLongDashDot]: {
        description: "ISO long-dash dot ____ . ____ . ____ . ____ . _",
        pattern: isoPattern(24, -3, 0, -3),
    },
    [LineType.IsoLongDashDoubleDot]: {
        description: "ISO long-dash double-dot ____ .. ____ .. ____ . ",
        pattern: isoPattern(24, -3, 0, -3, 0, -3),
    },
    [LineType.IsoLongDashTripleDot]: {
        description: "ISO long-dash triple-dot ____ ... ____ ... ____",
        pattern: isoPattern(24, -3, 0, -3, 0, -3, 0, -3),
    },
    [LineType.IsoDot]: {
        description: "ISO dot . . . . . . . . . . . . . . . . . . . . ",
        pattern: isoPattern(0, -3),
    },
    [LineType.IsoLongDashShortDash]: {
        description: "ISO long-dash short-dash ____ __ ____ __ ____ _",
        pattern: isoPattern(24, -3, 6, -3),
    },
    [LineType.IsoLongDashDoubleShortDash]: {
        description: "ISO long-dash double-short-dash ____ __ __ ____",
        pattern: isoPattern(24, -3, 6, -3, 6, -3),
    },
    [LineType.IsoDashDot]: {
        description: "ISO dash dot __ . __ . __ . __ . __ . __ . __ . ",
        pattern: isoPattern(12, -3, 0, -3),
    },
    [LineType.IsoDoubleDashDot]: {
        description: "ISO double-dash dot __ __ . __ __ . __ __ . __ _",
        pattern: isoPattern(12, -3, 12, -3, 0, -3),
    },
    [LineType.IsoDashDoubleDot]: {
        description: "ISO dash double-dot __ . . __ . . __ . . __ . . ",
        pattern: isoPattern(12, -3, 0, -3, 0, -3),
    },
    [LineType.IsoDoubleDashDoubleDot]: {
        description: "ISO double-dash double-dot __ __ . . __ __ . . _",
        pattern: isoPattern(12, -3, 12, -3, 0, -3, 0, -3),
    },
    [LineType.IsoDashTripleDot]: {
        description: "ISO dash triple-dot __ . . . __ . . . __ . . . _",
        pattern: isoPattern(12, -3, 0, -3, 0, -3, 0, -3),
    },
    [LineType.IsoDoubleDashTripleDot]: {
        description: "ISO double-dash triple-dot __ __ . . . __ __ . .",
        pattern: isoPattern(12, -3, 12, -3, 0, -3, 0, -3, 0, -3),
    },
};

/** Scale that turns the tenth-of-an-inch pattern units into `unit`. */
export const LTYPE_SCALE: Readonly<Partial<Record<Unit, number>>> = {
    [Unit.Inch]: 0.1,
    [Unit.Foot]: 0.1 / 12,
    [Unit.Millimeter]: 2.54,
    [Unit.Centimeter]: 0.254,
    [Unit.Meter]: 0.00254,
};

/** Multiplicative factor converting a length in `from` into one in `to`. */
export function unitConversionScale(from: Unit, to: Unit): number {
    return METERS_PER_UNIT[from] / METERS_PER_UNIT[to];
}
