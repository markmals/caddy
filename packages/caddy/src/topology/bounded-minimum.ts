/**
 * Brent's bounded scalar minimization, a line-for-line port of SciPy's
 * `minimize_scalar(method="bounded")` (`scipy.optimize._optimize._minimize_scalar_bounded`),
 * which build123d uses as `Edge.param_at_point`'s last-resort search.
 */

const SQRT_EPS = Math.sqrt(2.2e-16);
const GOLDEN_MEAN = 0.5 * (3 - Math.sqrt(5));
const MAX_EVALUATIONS = 500;

export interface BoundedMinimum {
    /** Where the minimum was found. */
    readonly x: number;
    /** The function value there. */
    readonly value: number;
}

/** Minimize `f` over `[lower, upper]`, stopping once `x` is known to within `xTolerance`. */
export function boundedMinimum(
    f: (x: number) => number,
    lower: number,
    upper: number,
    xTolerance = 1e-5,
): BoundedMinimum {
    let a = lower;
    let b = upper;
    let fulc = a + GOLDEN_MEAN * (b - a);
    let nfc = fulc;
    let xf = fulc;
    let rat = 0;
    let e = 0;
    let fx = f(xf);
    let evaluations = 1;
    let ffulc = fx;
    let fnfc = fx;
    let xm = 0.5 * (a + b);
    let tol1 = SQRT_EPS * Math.abs(xf) + xTolerance / 3;
    let tol2 = 2 * tol1;

    while (Math.abs(xf - xm) > tol2 - 0.5 * (b - a)) {
        let golden = true;
        if (Math.abs(e) > tol1) {
            golden = false;
            let r = (xf - nfc) * (fx - ffulc);
            let q = (xf - fulc) * (fx - fnfc);
            let p = (xf - fulc) * q - (xf - nfc) * r;
            q = 2 * (q - r);
            if (q > 0) {
                p = -p;
            }
            q = Math.abs(q);
            r = e;
            e = rat;
            if (Math.abs(p) < Math.abs(0.5 * q * r) && p > q * (a - xf) && p < q * (b - xf)) {
                rat = p / q;
                let x = xf + rat;
                if (x - a < tol2 || b - x < tol2) {
                    rat = tol1 * signOrOne(xm - xf);
                }
            } else {
                golden = true;
            }
        }
        if (golden) {
            e = xf >= xm ? a - xf : b - xf;
            rat = GOLDEN_MEAN * e;
        }
        let x = xf + signOrOne(rat) * Math.max(Math.abs(rat), tol1);
        let fu = f(x);
        evaluations += 1;
        if (fu <= fx) {
            if (x >= xf) {
                a = xf;
            } else {
                b = xf;
            }
            fulc = nfc;
            ffulc = fnfc;
            nfc = xf;
            fnfc = fx;
            xf = x;
            fx = fu;
        } else {
            if (x < xf) {
                a = x;
            } else {
                b = x;
            }
            if (fu <= fnfc || nfc === xf) {
                fulc = nfc;
                ffulc = fnfc;
                nfc = x;
                fnfc = fu;
            } else if (fu <= ffulc || fulc === xf || fulc === nfc) {
                fulc = x;
                ffulc = fu;
            }
        }
        xm = 0.5 * (a + b);
        tol1 = SQRT_EPS * Math.abs(xf) + xTolerance / 3;
        tol2 = 2 * tol1;
        if (evaluations >= MAX_EVALUATIONS) {
            break;
        }
    }
    return { x: xf, value: fx };
}

/** NumPy's `sign(v) + (v == 0)`: the sign, with zero counted as positive. */
function signOrOne(value: number): number {
    return value === 0 ? 1 : Math.sign(value);
}
