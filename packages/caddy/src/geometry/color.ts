/**
 * RGBA colour, ported from build123d's `Color`.
 *
 * Channels are floats in 0..1 held exactly as OCCT's `Quantity_ColorRGBA` holds them, so a
 * colour survives a STEP round trip unchanged. Colours are immutable.
 */

import { GeometryError } from "../errors.ts";

/** Hex strings accepted by {@link Color}: `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`. */
const HEX = /^#?(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

export class Color {
    readonly red: number;
    readonly green: number;
    readonly blue: number;
    readonly alpha: number;

    /** From channels in 0..1, or from a hex string (`"#ff8800"`, `"#f80"`, `"#ff880080"`). */
    constructor(red: number | string, green = 0, blue = 0, alpha = 1) {
        if (typeof red === "string") {
            let parsed = Color.fromHex(red);
            this.red = parsed.red;
            this.green = parsed.green;
            this.blue = parsed.blue;
            this.alpha = parsed.alpha;
            return;
        }
        for (let [name, value] of [
            ["red", red],
            ["green", green],
            ["blue", blue],
            ["alpha", alpha],
        ] as const) {
            if (!Number.isFinite(value) || value < 0 || value > 1) {
                throw new GeometryError(`Color ${name} must be between 0 and 1, got ${value}`);
            }
        }
        this.red = red;
        this.green = green;
        this.blue = blue;
        this.alpha = alpha;
    }

    static fromHex(code: string): Color {
        if (!HEX.test(code)) {
            throw new GeometryError(`${JSON.stringify(code)} is not a #rgb[a]/#rrggbb[aa] colour`);
        }
        let digits = code.startsWith("#") ? code.slice(1) : code;
        let wide = digits.length <= 4;
        let size = wide ? 1 : 2;
        let scale = wide ? 15 : 255;
        let channel = (index: number): number => {
            let start = index * size;
            if (start >= digits.length) return 1;
            return Number.parseInt(digits.slice(start, start + size), 16) / scale;
        };
        return new Color(channel(0), channel(1), channel(2), channel(3));
    }

    static fromTuple(channels: readonly number[]): Color {
        let [red, green, blue, alpha] = channels;
        if (red === undefined || green === undefined || blue === undefined) {
            throw new GeometryError(`a colour needs at least 3 channels, got ${channels.length}`);
        }
        return new Color(red, green, blue, alpha ?? 1);
    }

    /** `[red, green, blue, alpha]`, as build123d's `Color.to_tuple()` returns. */
    toTuple(): [number, number, number, number] {
        return [this.red, this.green, this.blue, this.alpha];
    }

    /** `#rrggbbaa`, rounding each channel to 8 bits. */
    toHex(): string {
        let byte = (value: number): string =>
            Math.round(value * 255)
                .toString(16)
                .padStart(2, "0");
        return `#${byte(this.red)}${byte(this.green)}${byte(this.blue)}${byte(this.alpha)}`;
    }

    toString(): string {
        return `Color(${this.toTuple().join(", ")})`;
    }
}
