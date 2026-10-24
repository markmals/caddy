const SIGN_BIT = 63n;
const EXPONENT_MASK = 0x7ffn;
const EXPONENT_SHIFT = 52n;
const FRACTION_MASK = 0xf_ffff_ffff_ffffn;
const IMPLICIT_BIT = 0x10_0000_0000_0000n;
/** Exponent of the least significant mantissa bit for a normal double. */
const MANTISSA_BIAS = 1075;

/**
 * Round `value` to `digits` decimal places, resolving ties to the even neighbour.
 *
 * This is Python's `round(value, digits)`, which build123d applies to the directions it reads
 * back out of OCCT. The work is done on the double's exact binary value with `BigInt`, so a
 * value that lies exactly halfway between two results — the only case where half-to-even differs
 * from the half-away-from-zero rounding JavaScript offers — lands on the same side as in Python.
 */
export function roundTo(value: number, digits: number): number {
    if (!Number.isFinite(value) || value === 0) {
        return value;
    }
    let { negative, quotient } = scaled(value, digits);
    return Number(decimalText(negative, quotient, digits));
}

/**
 * `value` written with exactly `digits` decimal places, as Python's `format(value, f".{digits}f")`
 * does: ties resolve to the even neighbour and a negative value that rounds to nothing still
 * carries its sign (`-0.00`).
 */
export function formatFixed(value: number, digits: number): string {
    if (!Number.isFinite(value)) {
        return String(value);
    }
    if (value === 0) {
        return decimalText(Object.is(value, -0), 0n, digits);
    }
    let { negative, quotient } = scaled(value, digits);
    return decimalText(negative, quotient, digits);
}

/** `|value| * 10^digits` rounded half-to-even on the double's exact binary value. */
function scaled(value: number, digits: number): { negative: boolean; quotient: bigint } {
    if (!Number.isInteger(digits)) {
        throw new RangeError(`Digits must be an integer, got ${digits}`);
    }

    let { negative, mantissa, exponent } = decompose(value);
    let scale = 10n ** BigInt(Math.abs(digits));
    let numerator = digits >= 0 ? mantissa * scale : mantissa;
    let denominator = digits >= 0 ? 1n : scale;
    if (exponent >= 0) {
        numerator <<= BigInt(exponent);
    } else {
        denominator <<= BigInt(-exponent);
    }

    let quotient = numerator / denominator;
    let doubledRemainder = (numerator % denominator) * 2n;
    if (
        doubledRemainder > denominator ||
        (doubledRemainder === denominator && quotient % 2n !== 0n)
    ) {
        quotient += 1n;
    }
    return { negative, quotient };
}

/** A finite non-zero double as `(-1)^negative * mantissa * 2^exponent`, exactly. */
function decompose(value: number): { negative: boolean; mantissa: bigint; exponent: number } {
    let view = new DataView(new ArrayBuffer(8));
    view.setFloat64(0, value);
    let bits = view.getBigUint64(0);
    let biased = Number((bits >> EXPONENT_SHIFT) & EXPONENT_MASK);
    let fraction = bits & FRACTION_MASK;
    return {
        negative: bits >> SIGN_BIT === 1n,
        mantissa: biased === 0 ? fraction : fraction | IMPLICIT_BIT,
        // Subnormals share the smallest normal exponent but have no implicit leading bit.
        exponent: biased === 0 ? -(MANTISSA_BIAS - 1) : biased - MANTISSA_BIAS,
    };
}

/** `quotient * 10^-digits` as a decimal literal, so parsing back is correctly rounded. */
function decimalText(negative: boolean, quotient: bigint, digits: number): string {
    let text = quotient.toString();
    if (digits <= 0) {
        text += "0".repeat(-digits);
    } else {
        text = text.padStart(digits + 1, "0");
        text = `${text.slice(0, -digits)}.${text.slice(-digits)}`;
    }
    return negative ? `-${text}` : text;
}
