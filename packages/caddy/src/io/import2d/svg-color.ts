/**
 * Colour parsing for the SVG importer, following `svgelements`' `Color.parse`.
 *
 * A parsed colour keeps both its packed `RRGGBBAA` value and its channels, because build123d
 * treats a zero value — `none` has no value at all, `transparent` has one that is zero — as "no
 * colour" while still counting the element as filled.
 */

import { CSS_COLORS } from "./css-colors.ts";

export interface SvgColor {
    /** Packed `RRGGBBAA`, as `svgelements` stores it. */
    readonly value: number;
    readonly red: number;
    readonly green: number;
    readonly blue: number;
    readonly alpha: number;
}

const HEX = /^#?([0-9A-Fa-f]{3,8})$/;
const FLOAT = String.raw`[-+]?[0-9]*\.?[0-9]+(?:[eE][-+]?[0-9]+)?`;
const RGB = new RegExp(
    `rgba?\\(\\s*(${FLOAT})\\s*,\\s*(${FLOAT})\\s*,\\s*(${FLOAT})\\s*(?:,\\s*(${FLOAT})\\s*)?\\)`,
);
const RGB_PERCENT = new RegExp(
    `rgba?\\(\\s*(${FLOAT})%\\s*,\\s*(${FLOAT})%\\s*,\\s*(${FLOAT})%\\s*(?:,\\s*(${FLOAT})\\s*)?\\)`,
);
const HSL = new RegExp(
    `hsla?\\(\\s*(${FLOAT})\\s*,\\s*(${FLOAT})%\\s*,\\s*(${FLOAT})%\\s*(?:,\\s*(${FLOAT})\\s*)?\\)`,
);

/** `undefined` for `none` and for a missing value; anything unrecognised is opaque black. */
export function parseColor(text: string | undefined): SvgColor | undefined {
    if (text === undefined || text === "none") return undefined;
    let hex = HEX.exec(text);
    if (hex !== null) return fromHex(hex[1] ?? "");
    let rgb = RGB.exec(text);
    if (rgb !== null) return fromChannels(numbers(rgb, 1), opacity(rgb[4]));
    let percent = RGB_PERCENT.exec(text);
    if (percent !== null) {
        return fromChannels(
            numbers(percent, 2.55).map(channel => Math.round(channel)),
            opacity(percent[4]),
        );
    }
    let hsl = HSL.exec(text);
    if (hsl !== null) {
        let [hue, saturation, lightness] = numbers(hsl, 1);
        return fromHsl(
            (hue ?? 0) / 360,
            (saturation ?? 0) / 100,
            (lightness ?? 0) / 100,
            opacity(hsl[4]),
        );
    }
    let keyword = CSS_COLORS[text.replace(/ /g, "").toLowerCase()];
    if (keyword === undefined) return fromChannels([0, 0, 0], 1);
    return fromChannels(keyword.slice(0, 3), keyword[3] ?? 1);
}

function fromHex(digits: string): SvgColor {
    let expand = (text: string): SvgColor =>
        packed(
            Number.parseInt(text.slice(0, 2), 16),
            Number.parseInt(text.slice(2, 4), 16),
            Number.parseInt(text.slice(4, 6), 16),
            Number.parseInt(text.slice(6, 8), 16),
        );
    switch (digits.length) {
        case 8:
            return expand(digits);
        case 6:
            return expand(`${digits}FF`);
        case 4:
            return expand(
                digits
                    .split("")
                    .map(digit => digit.repeat(2))
                    .join(""),
            );
        case 3:
            return expand(
                `${digits
                    .split("")
                    .map(digit => digit.repeat(2))
                    .join("")}FF`,
            );
        default:
            return fromChannels([0, 0, 0], 1);
    }
}

function fromChannels(channels: readonly number[], alpha: number): SvgColor {
    let [red, green, blue] = channels;
    return packed(
        crimp(red ?? 0),
        crimp(green ?? 0),
        crimp(blue ?? 0),
        crimp(Math.round(alpha * 255)),
    );
}

/** `svgelements`' HSL conversion, kept because its rounding shows up in imported colours. */
function fromHsl(hue: number, saturation: number, lightness: number, alpha: number): SvgColor {
    if (saturation === 0) {
        let grey = 255 * lightness;
        return fromChannels([grey, grey, grey], alpha);
    }
    let upper =
        lightness < 0.5
            ? lightness * (1 + saturation)
            : lightness + saturation - saturation * lightness;
    let lower = 2 * lightness - upper;
    return fromChannels(
        [
            255 * hueToChannel(lower, upper, hue + 1 / 3),
            255 * hueToChannel(lower, upper, hue),
            255 * hueToChannel(lower, upper, hue - 1 / 3),
        ],
        alpha,
    );
}

function hueToChannel(lower: number, upper: number, hue: number): number {
    let shifted = hue < 0 ? hue + 1 : hue > 1 ? hue - 1 : hue;
    if (6 * shifted < 1) return lower + (upper - lower) * 6 * shifted;
    if (2 * shifted < 1) return upper;
    if (3 * shifted < 2) return lower + (upper - lower) * (2 / 3 - shifted) * 6;
    return lower;
}

function packed(red: number, green: number, blue: number, alpha: number): SvgColor {
    return {
        value: ((red << 24) | (green << 16) | (blue << 8) | alpha) >>> 0,
        red,
        green,
        blue,
        alpha,
    };
}

function numbers(match: RegExpExecArray, scale: number): number[] {
    return [1, 2, 3].map(index => Number.parseFloat(match[index] ?? "0") * scale);
}

function opacity(text: string | undefined): number {
    if (text === undefined) return 1;
    return Math.min(1, Math.max(0, Number.parseFloat(text)));
}

function crimp(value: number): number {
    if (value > 255) return 255;
    if (value < 0) return 0;
    return Math.trunc(value);
}
