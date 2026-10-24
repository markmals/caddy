//! Optimisers the Gordon surface port needs: BFGS with the MINPACK Wolfe line search, the
//! bounded scalar Brent search, and the inverse-Hessian seed `ocp_gordon` wraps BFGS in.
//!
//! SPDX-License-Identifier: Apache-2.0
//!
//! Ported from `ocp_gordon` (Apache-2.0, SPDX-FileCopyrightText: 2018 German Aerospace Center
//! (DLR)) — `internal/misc.py::math_BFGS` — and from SciPy (BSD-3-Clause) —
//! `optimize/_optimize.py` (`_minimize_bfgs`, `_line_search_wolfe12`,
//! `_minimize_scalar_bounded`), `optimize/_linesearch.py` (`line_search_wolfe1`,
//! `line_search_wolfe2`) and `optimize/_dcsrch.py` (`DCSRCH`, `dcstep`). Constants, branch
//! order and termination tests follow the originals so results agree to round-off.

use crate::gordon::linalg::Matrix;

/// Armijo condition parameter (`_minimize_bfgs` default `c1`).
const C1: f64 = 1e-4;
/// Curvature condition parameter (`_minimize_bfgs` default `c2`).
const C2: f64 = 0.9;
/// `_minimize_bfgs` passes these step bounds to the line search.
const AMIN: f64 = 1e-100;
const AMAX: f64 = 1e100;
/// `line_search_wolfe1` default relative step tolerance.
const XTOL: f64 = 1e-14;
/// `_minimize_bfgs` default relative tolerance on `x`.
const XRTOL: f64 = 0.0;
const DCSRCH_MAXITER: usize = 100;
const WOLFE2_MAXITER: usize = 10;
const ZOOM_MAXITER: usize = 10;

pub(crate) trait GradientObjective {
    /// Returns (value, gradient); gradient has the same length as `x`.
    fn evaluate(&self, x: &[f64]) -> (f64, Vec<f64>);
}

/// `ocp_gordon` `misc.math_BFGS`: central-difference inverse-Hessian seed, then BFGS.
pub(crate) fn math_bfgs(objective: &dyn GradientObjective, x: &mut [f64], tolerance: f64) -> bool {
    let seed = estimate_initial_inverse_hessian(objective, x);
    minimize_bfgs(objective, x, tolerance, Some(&seed))
}

/// `scipy.optimize.minimize(f, x0, jac=True, method="BFGS", tol=gtol, options={"hess_inv0": ..})`.
/// Returns `res.success` and writes `res.x` back into `x`.
pub(crate) fn minimize_bfgs(
    objective: &dyn GradientObjective,
    x: &mut [f64],
    gtol: f64,
    initial_inverse_hessian: Option<&Matrix>,
) -> bool {
    let maxiter = 200 * x.len();
    let (mut old_fval, mut gradient) = objective.evaluate(x);
    let identity = Matrix::identity(x.len());
    let mut hessian_inverse = initial_inverse_hessian.cloned().unwrap_or_else(|| identity.clone());
    // Sets the initial step guess to dx ~ 1.
    let mut old_old_fval = old_fval + euclidean_norm(&gradient) / 2.0;
    let mut xk = x.to_vec();
    let mut iterations = 0;
    let mut precision_loss = false;
    let mut gnorm = max_norm(&gradient);

    while gnorm > gtol && iterations < maxiter {
        let direction: Vec<f64> =
            matrix_times_vector(&hessian_inverse, &gradient).iter().map(|slope| -slope).collect();
        let Some(step) =
            line_search_wolfe12(objective, &xk, &direction, &gradient, old_fval, old_old_fval)
        else {
            precision_loss = true;
            break;
        };
        old_fval = step.fval;
        old_old_fval = step.old_fval;

        let shift: Vec<f64> = direction.iter().map(|slope| step.alpha * slope).collect();
        for (coordinate, increment) in xk.iter_mut().zip(shift.iter()) {
            *coordinate += increment;
        }
        let next_gradient = step.gradient.unwrap_or_else(|| objective.evaluate(&xk).1);
        let gradient_change: Vec<f64> = next_gradient
            .iter()
            .zip(gradient.iter())
            .map(|(next, current)| next - current)
            .collect();
        gradient = next_gradient;
        iterations += 1;

        gnorm = max_norm(&gradient);
        if gnorm <= gtol {
            break;
        }
        //  See Chapter 5 in P.E. Frandsen, K. Jonasson, H.B. Nielsen, O. Tingleff:
        //  "Unconstrained Optimization", IMM, DTU. 1999.
        if step.alpha * euclidean_norm(&direction) <= XRTOL * (XRTOL + euclidean_norm(&xk)) {
            break;
        }
        if !old_fval.is_finite() {
            // We correctly found +-Inf as optimal value, or something went wrong.
            precision_loss = true;
            break;
        }
        hessian_inverse =
            updated_inverse_hessian(&identity, &hessian_inverse, &shift, &gradient_change);
    }

    x.copy_from_slice(&xk);
    if precision_loss || iterations >= maxiter {
        return false;
    }
    !(gnorm.is_nan() || old_fval.is_nan() || xk.iter().any(|coordinate| coordinate.is_nan()))
}

/// `scipy.optimize.minimize_scalar(f, bounds, method="Bounded", options={"xatol": xatol})`:
/// Brent's bounded method. Returns (x, fun, success); `bounds` must be finite and ordered.
pub(crate) fn minimize_scalar_bounded(
    objective: &mut dyn FnMut(f64) -> f64,
    bounds: (f64, f64),
    xatol: f64,
) -> (f64, f64, bool) {
    let maxfun = 500;
    let sqrt_eps = 2.2e-16_f64.sqrt();
    let golden_mean = 0.5 * (3.0 - 5.0_f64.sqrt());
    let (mut lower, mut upper) = bounds;

    let mut flag = 0;
    let mut fulcrum = lower + golden_mean * (upper - lower);
    let mut next_to_fulcrum = fulcrum;
    let mut best = fulcrum;
    let mut rat = 0.0_f64;
    let mut step = 0.0_f64;
    let mut best_value = objective(best);
    let mut evaluations = 1;
    let mut trial_value = f64::INFINITY;

    let mut fulcrum_value = best_value;
    let mut next_to_fulcrum_value = best_value;
    let mut middle = 0.5 * (lower + upper);
    let mut tol1 = sqrt_eps * best.abs() + xatol / 3.0;
    let mut tol2 = 2.0 * tol1;

    while (best - middle).abs() > tol2 - 0.5 * (upper - lower) {
        let mut golden = true;
        if step.abs() > tol1 {
            golden = false;
            let mut r = (best - next_to_fulcrum) * (best_value - fulcrum_value);
            let mut q = (best - fulcrum) * (best_value - next_to_fulcrum_value);
            let mut p = (best - fulcrum) * q - (best - next_to_fulcrum) * r;
            q = 2.0 * (q - r);
            if q > 0.0 {
                p = -p;
            }
            q = q.abs();
            r = step;
            step = rat;

            if p.abs() < (0.5 * q * r).abs() && p > q * (lower - best) && p < q * (upper - best) {
                rat = (p + 0.0) / q;
                let trial = best + rat;
                if trial - lower < tol2 || upper - trial < tol2 {
                    let direction = numpy_sign(middle - best) + f64::from(middle - best == 0.0);
                    rat = tol1 * direction;
                }
            } else {
                golden = true;
            }
        }

        if golden {
            step = if best >= middle { lower - best } else { upper - best };
            rat = golden_mean * step;
        }

        let direction = numpy_sign(rat) + f64::from(rat == 0.0);
        let trial = best + direction * larger(rat.abs(), tol1);
        trial_value = objective(trial);
        evaluations += 1;

        if trial_value <= best_value {
            if trial >= best {
                lower = best;
            } else {
                upper = best;
            }
            (fulcrum, fulcrum_value) = (next_to_fulcrum, next_to_fulcrum_value);
            (next_to_fulcrum, next_to_fulcrum_value) = (best, best_value);
            (best, best_value) = (trial, trial_value);
        } else {
            if trial < best {
                lower = trial;
            } else {
                upper = trial;
            }
            if trial_value <= next_to_fulcrum_value || next_to_fulcrum == best {
                (fulcrum, fulcrum_value) = (next_to_fulcrum, next_to_fulcrum_value);
                (next_to_fulcrum, next_to_fulcrum_value) = (trial, trial_value);
            } else if trial_value <= fulcrum_value || fulcrum == best || fulcrum == next_to_fulcrum
            {
                (fulcrum, fulcrum_value) = (trial, trial_value);
            }
        }

        middle = 0.5 * (lower + upper);
        tol1 = sqrt_eps * best.abs() + xatol / 3.0;
        tol2 = 2.0 * tol1;

        if evaluations >= maxfun {
            flag = 1;
            break;
        }
    }

    if best.is_nan() || best_value.is_nan() || trial_value.is_nan() {
        flag = 2;
    }
    (best, best_value, flag == 0)
}

/// `misc.math_BFGS::estimate_initial_inv_hessian`: finite-difference the gradient, invert,
/// then project onto the positive definite cone.
fn estimate_initial_inverse_hessian(objective: &dyn GradientObjective, x0: &[f64]) -> Matrix {
    const REL_EPS: f64 = 1e-8;
    const REG: f64 = 1e-8;

    let variables = x0.len();
    let mut hessian = Matrix::zeros(variables, variables);
    let mut probe = x0.to_vec();
    for col in 0..variables {
        let eps = REL_EPS * larger(1.0, x0[col].abs());
        probe.copy_from_slice(x0);
        probe[col] = x0[col] + eps;
        let (_, forward) = objective.evaluate(&probe);
        probe[col] = x0[col] - eps;
        let (_, backward) = objective.evaluate(&probe);
        for row in 0..variables {
            hessian.set(row, col, (forward[row] - backward[row]) / (2.0 * eps));
        }
    }
    symmetrise(&mut hessian);

    let diagonal_scale = larger(max_abs_diagonal(&hessian), 1.0);
    let mut regularised = hessian.clone();
    for index in 0..variables {
        regularised.add_at(index, index, REG * diagonal_scale);
    }

    let curvature_fallback =
        || scaled_identity(variables, 1.0 / larger(1e-8, mean_abs_diagonal(&hessian)));
    let mut inverse = regularised.inverse().unwrap_or_else(|_| curvature_fallback());
    symmetrise(&mut inverse);

    let (mut eigenvalues, eigenvectors) = inverse.symmetric_eigen();
    let mut spectrum = Matrix::zeros(variables, variables);
    for (index, eigenvalue) in eigenvalues.iter_mut().enumerate() {
        *eigenvalue = larger(*eigenvalue, REL_EPS);
        spectrum.set(index, index, *eigenvalue);
    }
    let mut projected = eigenvectors.multiplied(&spectrum).multiplied(&eigenvectors.transposed());
    symmetrise(&mut projected);
    if projected.cholesky().is_err() {
        return curvature_fallback();
    }
    projected
}

/// `Hk <- (I - rho s y^T) Hk (I - rho y s^T) + rho s s^T`.
fn updated_inverse_hessian(
    identity: &Matrix,
    hessian_inverse: &Matrix,
    shift: &[f64],
    gradient_change: &[f64],
) -> Matrix {
    let curvature = dot(gradient_change, shift);
    // Preserved from scipy: a zero denominator is replaced by a large rho rather than failing.
    let rho = if curvature == 0.0 { 1000.0 } else { 1.0 / curvature };

    let mut left = identity.clone();
    let mut right = identity.clone();
    for row in 0..shift.len() {
        for col in 0..shift.len() {
            left.add_at(row, col, -(shift[row] * gradient_change[col] * rho));
            right.add_at(row, col, -(gradient_change[row] * shift[col] * rho));
        }
    }
    let mut updated = left.multiplied(&hessian_inverse.multiplied(&right));
    for row in 0..shift.len() {
        for col in 0..shift.len() {
            updated.add_at(row, col, rho * shift[row] * shift[col]);
        }
    }
    updated
}

struct LineSearchOutcome {
    alpha: f64,
    /// phi at the accepted step; becomes the caller's `old_fval`.
    fval: f64,
    /// phi at zero; becomes the caller's `old_old_fval`.
    old_fval: f64,
    /// Gradient at the accepted step when the search already evaluated it.
    gradient: Option<Vec<f64>>,
}

/// `_line_search_wolfe12`: MINPACK search first, pure-Python search as fallback. `None` is
/// scipy's `_LineSearchError`. `_minimize_bfgs` passes no `extra_condition`, so scipy's hook for
/// it is always inert and is left out; `amax` is the step bound both searches receive.
fn line_search_wolfe12(
    objective: &dyn GradientObjective,
    point: &[f64],
    direction: &[f64],
    gradient: &[f64],
    old_fval: f64,
    old_old_fval: f64,
) -> Option<LineSearchOutcome> {
    let derphi0 = dot(gradient, direction);

    let mut probe = DirectionalProbe::new(objective, point, direction, Some(gradient.to_vec()));
    let (alpha, fval) = line_search_wolfe1(&mut probe, old_fval, old_old_fval, derphi0);
    if let Some(alpha) = alpha {
        return Some(LineSearchOutcome { alpha, fval, old_fval, gradient: probe.gradient });
    }

    let mut probe = DirectionalProbe::new(objective, point, direction, None);
    let found = line_search_wolfe2(&mut probe, old_fval, old_old_fval, derphi0)?;
    Some(LineSearchOutcome {
        alpha: found.alpha,
        fval: found.phi,
        old_fval,
        gradient: found.gradient,
    })
}

/// `phi(alpha) = f(point + alpha * direction)` and its derivative, remembering the gradient of
/// the most recent derivative evaluation.
struct DirectionalProbe<'a> {
    objective: &'a dyn GradientObjective,
    point: &'a [f64],
    direction: &'a [f64],
    gradient: Option<Vec<f64>>,
    probe_point: Vec<f64>,
}

impl<'a> DirectionalProbe<'a> {
    fn new(
        objective: &'a dyn GradientObjective,
        point: &'a [f64],
        direction: &'a [f64],
        gradient: Option<Vec<f64>>,
    ) -> Self {
        Self { objective, point, direction, gradient, probe_point: vec![0.0; point.len()] }
    }

    fn move_to(&mut self, alpha: f64) {
        let steps = self.point.iter().zip(self.direction.iter());
        for (target, (base, slope)) in self.probe_point.iter_mut().zip(steps) {
            *target = base + alpha * slope;
        }
    }

    fn phi(&mut self, alpha: f64) -> f64 {
        self.move_to(alpha);
        self.objective.evaluate(&self.probe_point).0
    }

    fn derphi(&mut self, alpha: f64) -> f64 {
        self.move_to(alpha);
        let (_, gradient) = self.objective.evaluate(&self.probe_point);
        let slope = dot(&gradient, self.direction);
        self.gradient = Some(gradient);
        slope
    }
}

/// `line_search_wolfe1` + `scalar_search_wolfe1`. Returns (step, phi at step); the step is
/// `None` when DCSRCH does not converge.
fn line_search_wolfe1(
    probe: &mut DirectionalProbe,
    phi0: f64,
    old_phi0: f64,
    derphi0: f64,
) -> (Option<f64>, f64) {
    let mut alpha1 = if derphi0 != 0.0 {
        let guess = 1.01 * 2.0 * (phi0 - old_phi0) / derphi0;
        if guess < 1.0 { guess } else { 1.0 }
    } else {
        1.0
    };
    if alpha1 < 0.0 {
        alpha1 = 1.0;
    }
    Dcsrch::new(C1, C2, XTOL, AMIN, AMAX).search(probe, alpha1, phi0, derphi0)
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Task {
    Start,
    Fg,
    Convergence,
    Warning,
    Error,
}

/// MINPACK `dcsrch`: finds a step satisfying the strong Wolfe conditions.
struct Dcsrch {
    ftol: f64,
    gtol: f64,
    xtol: f64,
    stpmin: f64,
    stpmax: f64,
    stage: u8,
    brackt: bool,
    finit: f64,
    ginit: f64,
    gtest: f64,
    stx: f64,
    fx: f64,
    gx: f64,
    sty: f64,
    fy: f64,
    gy: f64,
    stmin: f64,
    stmax: f64,
    width: f64,
    width1: f64,
}

impl Dcsrch {
    fn new(ftol: f64, gtol: f64, xtol: f64, stpmin: f64, stpmax: f64) -> Self {
        Self {
            ftol,
            gtol,
            xtol,
            stpmin,
            stpmax,
            stage: 0,
            brackt: false,
            finit: 0.0,
            ginit: 0.0,
            gtest: 0.0,
            stx: 0.0,
            fx: 0.0,
            gx: 0.0,
            sty: 0.0,
            fy: 0.0,
            gy: 0.0,
            stmin: 0.0,
            stmax: 0.0,
            width: 0.0,
            width1: 0.0,
        }
    }

    fn search(
        &mut self,
        probe: &mut DirectionalProbe,
        alpha1: f64,
        phi0: f64,
        derphi0: f64,
    ) -> (Option<f64>, f64) {
        let mut alpha = alpha1;
        let mut phi = phi0;
        let mut derphi = derphi0;
        let mut task = Task::Start;

        for _ in 0..DCSRCH_MAXITER {
            let (step, next) = self.iterate(alpha, phi, derphi, task);
            task = next;
            if !step.is_finite() {
                break;
            }
            if task != Task::Fg {
                if task == Task::Convergence {
                    return (Some(step), phi);
                }
                break;
            }
            alpha = step;
            phi = probe.phi(step);
            derphi = probe.derphi(step);
        }
        (None, phi)
    }

    fn iterate(&mut self, stp: f64, f: f64, g: f64, task: Task) -> (f64, Task) {
        if task == Task::Start {
            return self.begin(stp, f, g);
        }

        let mut stp = stp;
        // If psi(stp) <= 0 and f'(stp) >= 0 for some step, the algorithm enters stage two.
        let ftest = self.finit + stp * self.gtest;
        if self.stage == 1 && f <= ftest && g >= 0.0 {
            self.stage = 2;
        }

        let mut task = Task::Fg;
        if self.brackt && (stp <= self.stmin || stp >= self.stmax) {
            task = Task::Warning;
        }
        if self.brackt && self.stmax - self.stmin <= self.xtol * self.stmax {
            task = Task::Warning;
        }
        if stp == self.stpmax && f <= ftest && g <= self.gtest {
            task = Task::Warning;
        }
        if stp == self.stpmin && (f > ftest || g >= self.gtest) {
            task = Task::Warning;
        }
        if f <= ftest && g.abs() <= self.gtol * -self.ginit {
            task = Task::Convergence;
        }
        if task != Task::Fg {
            return (stp, task);
        }

        stp = self.advance(stp, f, g, ftest);

        if self.brackt {
            if (self.sty - self.stx).abs() >= 0.66 * self.width1 {
                stp = self.stx + 0.5 * (self.sty - self.stx);
            }
            self.width1 = self.width;
            self.width = (self.sty - self.stx).abs();
            self.stmin = smaller(self.stx, self.sty);
            self.stmax = larger(self.stx, self.sty);
        } else {
            self.stmin = stp + 1.1 * (stp - self.stx);
            self.stmax = stp + 4.0 * (stp - self.stx);
        }

        stp = clip(stp, self.stpmin, self.stpmax);
        // If further progress is not possible, fall back on the best point obtained so far.
        if self.brackt
            && ((stp <= self.stmin || stp >= self.stmax)
                || self.stmax - self.stmin <= self.xtol * self.stmax)
        {
            stp = self.stx;
        }
        (stp, Task::Fg)
    }

    fn begin(&mut self, stp: f64, f: f64, g: f64) -> (f64, Task) {
        let rejected = stp < self.stpmin
            || stp > self.stpmax
            || g >= 0.0
            || self.ftol < 0.0
            || self.gtol < 0.0
            || self.xtol < 0.0
            || self.stpmin < 0.0
            || self.stpmax < self.stpmin;
        if rejected {
            return (stp, Task::Error);
        }

        self.brackt = false;
        self.stage = 1;
        self.finit = f;
        self.ginit = g;
        self.gtest = self.ftol * self.ginit;
        self.width = self.stpmax - self.stpmin;
        self.width1 = self.width / 0.5;
        // stx, fx, gx hold the best step so far; sty, fy, gy the other interval endpoint.
        self.stx = 0.0;
        self.fx = self.finit;
        self.gx = self.ginit;
        self.sty = 0.0;
        self.fy = self.finit;
        self.gy = self.ginit;
        self.stmin = 0.0;
        self.stmax = stp + 4.0 * stp;
        (stp, Task::Fg)
    }

    /// One `dcstep` update, on the modified function while the decrease is insufficient.
    fn advance(&mut self, stp: f64, f: f64, g: f64, ftest: f64) -> f64 {
        let modified = self.stage == 1 && f <= self.fx && f > ftest;
        let mut interval = if modified {
            Interval {
                stx: self.stx,
                fx: self.fx - self.stx * self.gtest,
                dx: self.gx - self.gtest,
                sty: self.sty,
                fy: self.fy - self.sty * self.gtest,
                dy: self.gy - self.gtest,
                stp,
                brackt: self.brackt,
            }
        } else {
            Interval {
                stx: self.stx,
                fx: self.fx,
                dx: self.gx,
                sty: self.sty,
                fy: self.fy,
                dy: self.gy,
                stp,
                brackt: self.brackt,
            }
        };
        let (fp, dp) = if modified { (f - stp * self.gtest, g - self.gtest) } else { (f, g) };
        dcstep(&mut interval, fp, dp, self.stmin, self.stmax);

        self.stx = interval.stx;
        self.sty = interval.sty;
        self.brackt = interval.brackt;
        if modified {
            self.fx = interval.fx + self.stx * self.gtest;
            self.fy = interval.fy + self.sty * self.gtest;
            self.gx = interval.dx + self.gtest;
            self.gy = interval.dy + self.gtest;
        } else {
            self.fx = interval.fx;
            self.fy = interval.fy;
            self.gx = interval.dx;
            self.gy = interval.dy;
        }
        interval.stp
    }
}

/// The step interval `dcstep` maintains: the best step `stx`, the other endpoint `sty` and the
/// trial step `stp`, each with its function value and derivative.
#[derive(Clone, Copy)]
struct Interval {
    stx: f64,
    fx: f64,
    dx: f64,
    sty: f64,
    fy: f64,
    dy: f64,
    stp: f64,
    brackt: bool,
}

/// MINPACK `dcstep`: computes a safeguarded step and updates the interval of uncertainty.
fn dcstep(interval: &mut Interval, fp: f64, dp: f64, stpmin: f64, stpmax: f64) {
    let Interval { stx, fx, dx, sty, fy, dy, stp, brackt } = *interval;
    let sgnd = numpy_sign(dp) * numpy_sign(dx);

    let stpf = if fp > fx {
        interval.brackt = true;
        step_for_higher_value(stx, fx, dx, stp, fp, dp)
    } else if sgnd < 0.0 {
        interval.brackt = true;
        step_for_opposite_signs(stx, fx, dx, stp, fp, dp)
    } else if dp.abs() < dx.abs() {
        step_for_smaller_derivative(interval, fp, dp, stpmin, stpmax)
    } else if brackt {
        step_for_bracketed_tail(sty, fy, dy, stp, fp, dp)
    } else if stp > stx {
        stpmax
    } else {
        stpmin
    };

    if fp > fx {
        interval.sty = stp;
        interval.fy = fp;
        interval.dy = dp;
    } else {
        if sgnd < 0.0 {
            interval.sty = stx;
            interval.fy = fx;
            interval.dy = dx;
        }
        interval.stx = stp;
        interval.fx = fp;
        interval.dx = dp;
    }
    interval.stp = stpf;
}

/// First case: a higher function value, so the minimum is bracketed. The cubic step is taken
/// when it is closer to `stx` than the quadratic step, otherwise their average.
fn step_for_higher_value(stx: f64, fx: f64, dx: f64, stp: f64, fp: f64, dp: f64) -> f64 {
    let theta = 3.0 * (fx - fp) / (stp - stx) + dx + dp;
    let scale = largest(theta.abs(), dx.abs(), dp.abs());
    let mut gamma = scale * ((theta / scale).powi(2) - (dx / scale) * (dp / scale)).sqrt();
    if stp < stx {
        gamma *= -1.0;
    }
    let p = (gamma - dx) + theta;
    let q = ((gamma - dx) + gamma) + dp;
    let cubic = stx + (p / q) * (stp - stx);
    let secant = stx + ((dx / ((fx - fp) / (stp - stx) + dx)) / 2.0) * (stp - stx);
    if (cubic - stx).abs() <= (secant - stx).abs() { cubic } else { cubic + (secant - cubic) / 2.0 }
}

/// Second case: a lower function value with derivatives of opposite sign, so the minimum is
/// bracketed. The cubic step is taken when it is farther from `stp` than the secant step.
fn step_for_opposite_signs(stx: f64, fx: f64, dx: f64, stp: f64, fp: f64, dp: f64) -> f64 {
    let theta = 3.0 * (fx - fp) / (stp - stx) + dx + dp;
    let scale = largest(theta.abs(), dx.abs(), dp.abs());
    let mut gamma = scale * ((theta / scale).powi(2) - (dx / scale) * (dp / scale)).sqrt();
    if stp > stx {
        gamma *= -1.0;
    }
    let p = (gamma - dp) + theta;
    let q = ((gamma - dp) + gamma) + dx;
    let cubic = stp + (p / q) * (stx - stp);
    let secant = stp + (dp / (dp - dx)) * (stx - stp);
    if (cubic - stp).abs() > (secant - stp).abs() { cubic } else { secant }
}

/// Third case: a lower function value, derivatives of the same sign, and the magnitude of the
/// derivative decreases.
fn step_for_smaller_derivative(
    interval: &Interval,
    fp: f64,
    dp: f64,
    stpmin: f64,
    stpmax: f64,
) -> f64 {
    let Interval { stx, fx, dx, sty, stp, brackt, .. } = *interval;
    let theta = 3.0 * (fx - fp) / (stp - stx) + dx + dp;
    let scale = largest(theta.abs(), dx.abs(), dp.abs());
    // gamma = 0 only arises if the cubic does not tend to infinity in the direction of the step.
    let mut gamma = scale * ((theta / scale).powi(2) - (dx / scale) * (dp / scale)).max(0.0).sqrt();
    if stp > stx {
        gamma = -gamma;
    }
    let p = (gamma - dp) + theta;
    let q = (gamma + (dx - dp)) + gamma;
    let ratio = p / q;
    let cubic = if ratio < 0.0 && gamma != 0.0 {
        stp + ratio * (stx - stp)
    } else if stp > stx {
        stpmax
    } else {
        stpmin
    };
    let secant = stp + (dp / (dp - dx)) * (stx - stp);

    if !brackt {
        let step = if (cubic - stp).abs() > (secant - stp).abs() { cubic } else { secant };
        return clip(step, stpmin, stpmax);
    }
    let step = if (cubic - stp).abs() < (secant - stp).abs() { cubic } else { secant };
    let bound = stp + 0.66 * (sty - stp);
    if stp > stx { smaller(bound, step) } else { larger(bound, step) }
}

/// Fourth case: a lower function value, derivatives of the same sign, the magnitude of the
/// derivative does not decrease, and the minimum is bracketed.
fn step_for_bracketed_tail(sty: f64, fy: f64, dy: f64, stp: f64, fp: f64, dp: f64) -> f64 {
    let theta = 3.0 * (fp - fy) / (sty - stp) + dy + dp;
    let scale = largest(theta.abs(), dy.abs(), dp.abs());
    let mut gamma = scale * ((theta / scale).powi(2) - (dy / scale) * (dp / scale)).sqrt();
    if stp > sty {
        gamma = -gamma;
    }
    let p = (gamma - dp) + theta;
    let q = ((gamma - dp) + gamma) + dy;
    stp + (p / q) * (sty - stp)
}

struct Wolfe2Step {
    alpha: f64,
    phi: f64,
    gradient: Option<Vec<f64>>,
}

/// `line_search_wolfe2` + `scalar_search_wolfe2`. `None` is a failed search.
fn line_search_wolfe2(
    probe: &mut DirectionalProbe,
    phi0: f64,
    old_phi0: f64,
    derphi0: f64,
) -> Option<Wolfe2Step> {
    let mut alpha0 = 0.0;
    let mut alpha1 = if derphi0 != 0.0 {
        let guess = 1.01 * 2.0 * (phi0 - old_phi0) / derphi0;
        if guess < 1.0 { guess } else { 1.0 }
    } else {
        1.0
    };
    if alpha1 < 0.0 {
        alpha1 = 1.0;
    }
    if alpha1 > AMAX {
        alpha1 = AMAX;
    }

    let mut phi_a1 = probe.phi(alpha1);
    let mut phi_a0 = phi0;
    let mut derphi_a0 = derphi0;

    for iteration in 0..WOLFE2_MAXITER {
        // alpha1 == 0 should not happen: the increment may have slipped below machine precision.
        if alpha1 == 0.0 || alpha0 > AMAX {
            return None;
        }
        if phi_a1 > phi0 + C1 * alpha1 * derphi0 || (phi_a1 >= phi_a0 && iteration > 0) {
            let found = zoom(probe, alpha0, alpha1, phi_a0, phi_a1, derphi_a0, phi0, derphi0)?;
            return Some(Wolfe2Step {
                alpha: found.alpha,
                phi: found.phi,
                gradient: probe.gradient.take(),
            });
        }

        let derphi_a1 = probe.derphi(alpha1);
        if derphi_a1.abs() <= -C2 * derphi0 {
            return Some(Wolfe2Step {
                alpha: alpha1,
                phi: phi_a1,
                gradient: probe.gradient.take(),
            });
        }
        if derphi_a1 >= 0.0 {
            let found = zoom(probe, alpha1, alpha0, phi_a1, phi_a0, derphi_a1, phi0, derphi0)?;
            return Some(Wolfe2Step {
                alpha: found.alpha,
                phi: found.phi,
                gradient: probe.gradient.take(),
            });
        }

        let alpha2 = if 2.0 * alpha1 > AMAX { AMAX } else { 2.0 * alpha1 };
        alpha0 = alpha1;
        alpha1 = alpha2;
        phi_a0 = phi_a1;
        phi_a1 = probe.phi(alpha1);
        derphi_a0 = derphi_a1;
    }
    // Stopping test: maxiter reached. scipy returns the last step without its gradient.
    Some(Wolfe2Step { alpha: alpha1, phi: phi_a1, gradient: None })
}

struct ZoomStep {
    alpha: f64,
    phi: f64,
}

/// `_zoom`: Algorithm 3.6 of Nocedal and Wright, interpolating between `a_lo` and `a_hi`.
#[allow(clippy::too_many_arguments)]
fn zoom(
    probe: &mut DirectionalProbe,
    mut a_lo: f64,
    mut a_hi: f64,
    mut phi_lo: f64,
    mut phi_hi: f64,
    mut derphi_lo: f64,
    phi0: f64,
    derphi0: f64,
) -> Option<ZoomStep> {
    const DELTA_CUBIC: f64 = 0.2;
    const DELTA_QUADRATIC: f64 = 0.1;

    let mut phi_rec = phi0;
    let mut a_rec = 0.0;
    let mut iteration = 0;
    loop {
        let dalpha = a_hi - a_lo;
        let (low, high) = if dalpha < 0.0 { (a_hi, a_lo) } else { (a_lo, a_hi) };

        // Cubic interpolation, falling back to quadratic and then bisection whenever the
        // minimizer lands outside the interval or too close to an endpoint.
        let mut trial = None;
        if iteration > 0 {
            let cubic_check = DELTA_CUBIC * dalpha;
            trial = cubicmin(a_lo, phi_lo, derphi_lo, a_hi, phi_hi, a_rec, phi_rec)
                .filter(|&value| value <= high - cubic_check && value >= low + cubic_check);
        }
        let trial = trial.unwrap_or_else(|| {
            let quadratic_check = DELTA_QUADRATIC * dalpha;
            quadmin(a_lo, phi_lo, derphi_lo, a_hi, phi_hi)
                .filter(|&value| value <= high - quadratic_check && value >= low + quadratic_check)
                .unwrap_or(a_lo + 0.5 * dalpha)
        });

        let phi_trial = probe.phi(trial);
        if phi_trial > phi0 + C1 * trial * derphi0 || phi_trial >= phi_lo {
            phi_rec = phi_hi;
            a_rec = a_hi;
            a_hi = trial;
            phi_hi = phi_trial;
        } else {
            let derphi_trial = probe.derphi(trial);
            if derphi_trial.abs() <= -C2 * derphi0 {
                return Some(ZoomStep { alpha: trial, phi: phi_trial });
            }
            if derphi_trial * (a_hi - a_lo) >= 0.0 {
                phi_rec = phi_hi;
                a_rec = a_hi;
                a_hi = a_lo;
                phi_hi = phi_lo;
            } else {
                phi_rec = phi_lo;
                a_rec = a_lo;
            }
            a_lo = trial;
            phi_lo = phi_trial;
            derphi_lo = derphi_trial;
        }

        iteration += 1;
        if iteration > ZOOM_MAXITER {
            return None;
        }
    }
}

/// `_cubicmin`: minimizer of the cubic through (a, fa), (b, fb), (c, fc) with derivative `fpa`
/// at `a`. scipy turns every arithmetic error into `None`, which here is a non-finite result.
fn cubicmin(a: f64, fa: f64, fpa: f64, b: f64, fb: f64, c: f64, fc: f64) -> Option<f64> {
    let db = b - a;
    let dc = c - a;
    let denom = (db * dc).powi(2) * (db - dc);
    let first = fb - fa - fpa * db;
    let second = fc - fa - fpa * dc;
    let cubic = (dc.powi(2) * first - db.powi(2) * second) / denom;
    let quadratic = (-dc.powi(3) * first + db.powi(3) * second) / denom;
    if !cubic.is_finite() || !quadratic.is_finite() {
        return None;
    }
    let radical = quadratic * quadratic - 3.0 * cubic * fpa;
    let minimizer = a + (-quadratic + radical.sqrt()) / (3.0 * cubic);
    if minimizer.is_finite() { Some(minimizer) } else { None }
}

/// `_quadmin`: minimizer of the quadratic through (a, fa) and (b, fb) with derivative `fpa`
/// at `a`.
fn quadmin(a: f64, fa: f64, fpa: f64, b: f64, fb: f64) -> Option<f64> {
    let db = b - a * 1.0;
    let curvature = (fb - fa - fpa * db) / (db * db);
    if !curvature.is_finite() {
        return None;
    }
    let minimizer = a - fpa / (2.0 * curvature);
    if minimizer.is_finite() { Some(minimizer) } else { None }
}

fn symmetrise(matrix: &mut Matrix) {
    for row in 0..matrix.rows() {
        for col in row + 1..matrix.cols() {
            let average = 0.5 * (matrix.at(row, col) + matrix.at(col, row));
            matrix.set(row, col, average);
            matrix.set(col, row, average);
        }
    }
}

fn scaled_identity(size: usize, scale: f64) -> Matrix {
    let mut matrix = Matrix::zeros(size, size);
    for index in 0..size {
        matrix.set(index, index, scale);
    }
    matrix
}

fn max_abs_diagonal(matrix: &Matrix) -> f64 {
    let mut largest = 0.0;
    for index in 0..matrix.rows() {
        let magnitude = matrix.at(index, index).abs();
        if magnitude > largest {
            largest = magnitude;
        }
    }
    largest
}

fn mean_abs_diagonal(matrix: &Matrix) -> f64 {
    if matrix.rows() == 0 {
        return 0.0;
    }
    let total: f64 = (0..matrix.rows()).map(|index| matrix.at(index, index).abs()).sum();
    total / matrix.rows() as f64
}

fn matrix_times_vector(matrix: &Matrix, vector: &[f64]) -> Vec<f64> {
    (0..matrix.rows()).map(|row| dot(matrix.row_slice(row), vector)).collect()
}

fn dot(left: &[f64], right: &[f64]) -> f64 {
    left.iter().zip(right.iter()).map(|(first, second)| first * second).sum()
}

fn euclidean_norm(values: &[f64]) -> f64 {
    values.iter().map(|value| value * value).sum::<f64>().sqrt()
}

/// `vecnorm(x, ord=inf)`, propagating NaN the way `np.amax` does.
fn max_norm(values: &[f64]) -> f64 {
    let mut largest = 0.0;
    for value in values {
        let magnitude = value.abs();
        if magnitude.is_nan() {
            return f64::NAN;
        }
        if magnitude > largest {
            largest = magnitude;
        }
    }
    largest
}

/// Python's two-argument `max`, which keeps the first operand when the comparison is false.
fn larger(first: f64, second: f64) -> f64 {
    if second > first { second } else { first }
}

/// Python's two-argument `min`, which keeps the first operand when the comparison is false.
fn smaller(first: f64, second: f64) -> f64 {
    if second < first { second } else { first }
}

fn largest(first: f64, second: f64, third: f64) -> f64 {
    larger(larger(first, second), third)
}

/// `np.clip`, which passes NaN through.
fn clip(value: f64, low: f64, high: f64) -> f64 {
    if value < low {
        low
    } else if value > high {
        high
    } else {
        value
    }
}

fn numpy_sign(value: f64) -> f64 {
    if value > 0.0 {
        1.0
    } else if value < 0.0 {
        -1.0
    } else if value == 0.0 {
        0.0
    } else {
        f64::NAN
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    struct Rosenbrock;

    impl GradientObjective for Rosenbrock {
        fn evaluate(&self, x: &[f64]) -> (f64, Vec<f64>) {
            let (first, second) = (x[0], x[1]);
            let value = 100.0 * (second - first * first).powi(2) + (1.0 - first).powi(2);
            let gradient = vec![
                -400.0 * first * (second - first * first) - 2.0 * (1.0 - first),
                200.0 * (second - first * first),
            ];
            (value, gradient)
        }
    }

    /// `f(x, y) = (x - 1)^2 + 2 (y + 3)^2`, minimised at (1, -3).
    struct ShiftedQuadratic;

    impl GradientObjective for ShiftedQuadratic {
        fn evaluate(&self, x: &[f64]) -> (f64, Vec<f64>) {
            let (first, second) = (x[0], x[1]);
            let value = (first - 1.0).powi(2) + 2.0 * (second + 3.0).powi(2);
            (value, vec![2.0 * (first - 1.0), 4.0 * (second + 3.0)])
        }
    }

    fn assert_close(actual: f64, expected: f64, tolerance: f64) {
        assert!((actual - expected).abs() <= tolerance, "{actual} != {expected}");
    }

    #[test]
    fn minimises_a_parabola_within_bounds() {
        let mut evaluations = 0;
        let mut objective = |x: f64| {
            evaluations += 1;
            x * x
        };
        let (x, value, success) = minimize_scalar_bounded(&mut objective, (-2.0, 3.0), 1e-5);
        assert!(success);
        // scipy 1.18.1 `minimize_scalar(..., method="Bounded")` returns these to the last bit.
        assert_close(x, 2.7755575615628914e-17, 1e-20);
        assert_close(value, 7.703719777548943e-34, 1e-36);
        assert_eq!(evaluations, 6);
    }

    #[test]
    fn minimises_a_shifted_parabola_within_bounds() {
        let mut objective = |x: f64| (x - 0.3) * (x - 0.3) + 1.5;
        let (x, value, success) = minimize_scalar_bounded(&mut objective, (0.0, 1.0), 1e-8);
        assert!(success);
        assert_close(x, 0.29999999221694795, 1e-15);
        assert_close(value, 1.5, 1e-15);
    }

    #[test]
    fn stops_at_the_bound_when_the_minimum_lies_outside() {
        let mut objective = |x: f64| (x - 4.0) * (x - 4.0);
        let (x, value, success) = minimize_scalar_bounded(&mut objective, (0.0, 1.0), 1e-5);
        assert!(success);
        assert_close(x, 0.9999940391390134, 1e-15);
        assert_close(value, 9.000035765201451, 1e-14);
    }

    #[test]
    fn minimises_rosenbrock_from_the_classic_start() {
        let mut x = [-1.2, 1.0];
        assert!(minimize_bfgs(&Rosenbrock, &mut x, 1e-5, None));
        // scipy reaches (0.9999999710013947, 0.999999946119085) from here.
        assert_close(x[0], 0.9999999710013947, 1e-12);
        assert_close(x[1], 0.999999946119085, 1e-12);
    }

    #[test]
    fn minimises_a_quadratic() {
        let mut x = [5.0, 5.0];
        assert!(minimize_bfgs(&ShiftedQuadratic, &mut x, 1e-8, None));
        assert_close(x[0], 0.9999999998118397, 1e-15);
        assert_close(x[1], -3.0000000017366015, 1e-15);
    }

    #[test]
    fn reports_failure_when_the_gradient_contradicts_the_value() {
        // A gradient that is not a descent direction: both line searches give up, leaving x0.
        struct WrongGradient;

        impl GradientObjective for WrongGradient {
            fn evaluate(&self, x: &[f64]) -> (f64, Vec<f64>) {
                (x[0] * x[0] + x[1] * x[1], vec![-2.0 * x[0], 2.0 * x[1]])
            }
        }

        let mut x = [1.0, 1.0];
        assert!(!minimize_bfgs(&WrongGradient, &mut x, 1e-6, None));
        assert_eq!(x, [1.0, 1.0]);
    }

    #[test]
    fn seeds_the_inverse_hessian_from_central_differences() {
        let seed = estimate_initial_inverse_hessian(&ShiftedQuadratic, &[5.0, 5.0]);
        // The exact Hessian is diag(2, 4), so the seed is diag(0.5, 0.25) up to the regulariser.
        assert_close(seed.at(0, 0), 0.5, 1e-7);
        assert_close(seed.at(1, 1), 0.25, 1e-7);
        assert_close(seed.at(0, 1), 0.0, 1e-9);
        assert_close(seed.at(1, 0), 0.0, 1e-9);
        assert!(seed.cholesky().is_ok());
    }

    #[test]
    fn math_bfgs_minimises_with_the_seeded_hessian() {
        let mut rosenbrock = [-1.2, 1.0];
        assert!(math_bfgs(&Rosenbrock, &mut rosenbrock, 1e-6));
        assert_close(rosenbrock[0], 0.9999999998914232, 1e-12);
        assert_close(rosenbrock[1], 0.9999999998024263, 1e-12);

        let mut quadratic = [-4.0, 7.0];
        assert!(math_bfgs(&ShiftedQuadratic, &mut quadratic, 1e-8));
        assert_close(quadratic[0], 0.9999999999999978, 1e-15);
        assert_close(quadratic[1], -2.999999999999999, 1e-15);
    }
}
