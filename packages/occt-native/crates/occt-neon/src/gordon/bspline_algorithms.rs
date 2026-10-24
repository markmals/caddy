//! Port of ocp_gordon `internal/bspline_algorithms.py` (Apache-2.0,
//! SPDX-FileCopyrightText: 2018 German Aerospace Center (DLR)), limited to the helpers the
//! Gordon pipeline actually reaches.

use opencascade_sys::{
    b_spl_c_lib::BSplCLib,
    geom::{
        Geom_Curve_EvalD0, Geom_Curve_IsKind_str, Geom_TrimmedCurve_BasisCurve, Handle_Geom_Curve,
        Handle_Geom_Curve_get, Handle_Geom_TrimmedCurve_from_Geom_Curve,
        Handle_Geom_TrimmedCurve_get,
    },
    geom_abs::GeomAbs_Shape,
    geom_convert::{
        GeomConvert_ApproxCurve_Curve,
        GeomConvert_ApproxCurve_new_hgeom_curve_real_geomabs_shape_int2,
    },
    math::math_Matrix_new_int4,
    precision::Precision,
    t_col_std::TColStd_Array1OfReal_value,
};

use crate::error::{OcctError, OcctResult};
use crate::gordon::curve::{Curve, Point, distance, point_of, real_array};
use crate::gordon::linalg::Matrix;
use crate::gordon::surface::PointGrid;

/// Relative tolerance below which a curve or point row counts as closed.
pub(crate) const REL_TOL_CLOSED: f64 = 1e-8;
/// Tolerance for comparing curve parameters.
pub(crate) const PAR_CHECK_TOL: f64 = 1e-5;

fn is_inside_tolerance(value: f64, target: f64, tolerance: f64) -> bool {
    (value - target).abs() < tolerance
}

/// Evenly spaced values over `[umin, umax]` with `breaks` forced into the sequence, snapping a
/// nearby sample onto a break rather than inserting a near-duplicate.
pub(crate) fn linspace_with_breaks(
    umin: f64,
    umax: f64,
    n_values: usize,
    breaks: &[f64],
) -> Vec<f64> {
    if n_values < 2 {
        return if n_values == 1 { vec![umin] } else { Vec::new() };
    }

    let step = (umax - umin) / (n_values - 1) as f64;
    let mut result: Vec<f64> = (0..n_values).map(|index| umin + index as f64 * step).collect();
    let epsilon = 0.3;

    for breakpoint in breaks {
        let snapped = result
            .iter()
            .position(|value| is_inside_tolerance(*value, *breakpoint, step * epsilon));
        if let Some(index) = snapped {
            result[index] = *breakpoint;
            continue;
        }

        let mut closest = 0usize;
        let mut smallest = f64::INFINITY;
        for (index, value) in result.iter().enumerate() {
            let candidate = (value - breakpoint).abs();
            if candidate < smallest {
                smallest = candidate;
                closest = index;
            }
        }
        if result.is_empty() {
            result.push(*breakpoint);
        } else if result[closest] > *breakpoint {
            result.insert(closest, *breakpoint);
        } else {
            result.insert(closest + 1, *breakpoint);
        }
    }

    result
}

/// First and last row of the grid coincide.
pub(crate) fn is_u_dir_closed(points: &PointGrid, tolerance: f64) -> bool {
    let last = points.rows() - 1;
    (0..points.columns())
        .all(|column| distance(points.at(0, column), points.at(last, column)) <= tolerance)
}

/// First and last column of the grid coincide.
pub(crate) fn is_v_dir_closed(points: &PointGrid, tolerance: f64) -> bool {
    let last = points.columns() - 1;
    (0..points.rows()).all(|row| distance(points.at(row, 0), points.at(row, last)) <= tolerance)
}

/// Inner knots of full multiplicity where the tangent genuinely turns.
pub(crate) fn kink_parameters(curve: &Curve) -> OcctResult<Vec<f64>> {
    let epsilon = 1e-8;
    let angle_tolerance = 1e-4;
    let degree = curve.degree()?;
    let mut kinks = Vec::new();
    for index in 2..curve.nb_knots()? {
        if curve.multiplicity(index)? != degree {
            continue;
        }
        let knot = curve.knot(index)?;
        let angle = curve.derivative_angle(knot + epsilon, knot - epsilon, 1)?;
        if angle.abs() >= angle_tolerance && (angle - std::f64::consts::PI).abs() >= angle_tolerance
        {
            kinks.push(knot);
        }
    }
    Ok(kinks)
}

pub(crate) fn trim_curve(curve: &Curve, umin: f64, umax: f64) -> OcctResult<Curve> {
    let mut copy = curve.copied()?;
    copy.segment(umin, umax)?;
    Ok(copy)
}

/// Centripetal (`alpha = 0.5`) parameterisation of a point sequence.
pub(crate) fn compute_params_bspline_curve(points: &[Point], alpha: f64) -> Vec<f64> {
    if points.len() < 2 {
        return if points.len() == 1 { vec![0.0, 1.0] } else { Vec::new() };
    }

    let mut chord_lengths = Vec::with_capacity(points.len() - 1);
    let mut total_length = 0.0;
    for window in points.windows(2) {
        let length = distance(window[0], window[1]).powf(alpha);
        chord_lengths.push(length);
        total_length += length;
    }

    let mut params = vec![0.0];
    let mut current = 0.0;
    for length in chord_lengths {
        current += length;
        params.push(current / total_length);
    }
    params
}

/// Raises every curve to the highest degree in the set.
pub(crate) fn match_degree(curves: &mut [Curve]) -> OcctResult<()> {
    let mut max_degree = 0;
    for curve in curves.iter() {
        max_degree = max_degree.max(curve.degree()?);
    }
    for curve in curves.iter_mut() {
        if curve.degree()? < max_degree {
            curve.increase_degree(max_degree)?;
        }
    }
    Ok(())
}

fn knot_multiplicity(curve: &Curve, knot: f64, tolerance: f64) -> OcctResult<i32> {
    for index in 1..=curve.nb_knots()? {
        if (curve.knot(index)? - knot).abs() < tolerance {
            return curve.multiplicity(index);
        }
    }
    Ok(0)
}

fn insert_knots(
    curve: &Curve,
    knots: &[f64],
    multiplicities: &[i32],
    tolerance: f64,
) -> OcctResult<Curve> {
    let mut result = curve.copied()?;
    for (knot, multiplicity) in knots.iter().zip(multiplicities) {
        let mut existing = None;
        for index in 1..=result.nb_knots()? {
            if (result.knot(index)? - knot).abs() < tolerance {
                existing = Some(index);
                break;
            }
        }
        match existing {
            Some(index) => result.increase_multiplicity(index, *multiplicity)?,
            None => result.insert_knot(*knot, *multiplicity, tolerance)?,
        }
    }
    Ok(result)
}

/// Every curve re-expressed on the union of all knot vectors.
pub(crate) fn create_common_knots_vector_curve(
    curves: &[Curve],
    tolerance: f64,
) -> OcctResult<Vec<Curve>> {
    if curves.is_empty() {
        return Ok(Vec::new());
    }

    let mut all_knots = Vec::new();
    for curve in curves {
        all_knots.extend(curve.knots()?);
    }
    all_knots.sort_by(|left, right| left.partial_cmp(right).expect("knots are finite"));
    all_knots.dedup();

    let mut multiplicities = Vec::with_capacity(all_knots.len());
    for knot in &all_knots {
        let mut maximum = 0;
        for curve in curves {
            maximum = maximum.max(knot_multiplicity(curve, *knot, tolerance)?);
        }
        multiplicities.push(maximum);
    }

    curves.iter().map(|curve| insert_knots(curve, &all_knots, &multiplicities, tolerance)).collect()
}

/// Linearly maps the knot vector onto `[umin, umax]` in place.
pub(crate) fn reparametrize_bspline(curve: &mut Curve, umin: f64, umax: f64) -> OcctResult<()> {
    let mut knots = real_array(&curve.knots()?)?;
    BSplCLib::Reparametrize(umin, umax, knots.pin_mut())?;
    let mut reparametrized = Vec::with_capacity(curve.nb_knots()? as usize);
    for index in 1..=curve.nb_knots()? {
        reparametrized.push(TColStd_Array1OfReal_value(&knots, index)?);
    }
    curve.set_knots(&reparametrized)
}

/// Largest distance from the first pole to any other, floored at one.
pub(crate) fn scale_curve(curve: &Curve) -> OcctResult<f64> {
    let mut scale = 0.0f64;
    let poles = curve.poles()?;
    if let Some(first) = poles.first() {
        for pole in poles.iter().skip(1) {
            scale = scale.max(distance(*first, *pole));
        }
    }
    Ok(if scale > 0.0 { scale } else { 1.0 })
}

pub(crate) fn scale_curves(curves: &[Curve]) -> OcctResult<f64> {
    let mut scale = 0.0f64;
    for curve in curves {
        scale = scale.max(scale_curve(curve)?);
    }
    Ok(if scale > 0.0 { scale } else { 1.0 })
}

/// Grid scale: the widest row, measured from each row's first point. Unlike the curve variants
/// this one is not floored, matching the C++ overload ocp_gordon mirrors.
pub(crate) fn scale_grid(points: &PointGrid) -> f64 {
    let mut scale = 0.0f64;
    for row in 0..points.rows() {
        let first = points.at(row, 0);
        for column in 1..points.columns() {
            scale = scale.max(distance(first, points.at(row, column)));
        }
    }
    scale
}

/// Largest distance between any two points.
pub(crate) fn max_point_distance(points: &[Point]) -> f64 {
    let mut maximum = 0.0f64;
    for (index, first) in points.iter().enumerate() {
        for second in points.iter().skip(index + 1) {
            maximum = maximum.max(distance(*first, *second));
        }
    }
    maximum
}

/// ocp_gordon's `is_closed`: endpoints coincide *and* C2 continuity was requested.
pub(crate) fn points_form_closed_curve(points: &[Point], c2_continuous: bool) -> bool {
    let Some(first) = points.first() else {
        return false;
    };
    let Some(last) = points.last() else {
        return false;
    };
    let tolerance = 1e-6 * max_point_distance(points);
    distance(*first, *last) <= tolerance && c2_continuous
}

/// Averaged centripetal parameters in both directions of a point grid.
pub(crate) fn compute_params_bspline_surf(points: &PointGrid, alpha: f64) -> (Vec<f64>, Vec<f64>) {
    let mut params_u = vec![0.0; points.rows()];
    for column in 0..points.columns() {
        let line = compute_params_bspline_curve(&points.column(column), alpha);
        for (index, value) in line.iter().enumerate() {
            params_u[index] += value;
        }
    }
    for value in &mut params_u {
        *value /= points.columns() as f64;
    }

    let mut params_v = vec![0.0; points.columns()];
    for row in 0..points.rows() {
        let line = compute_params_bspline_curve(&points.row(row), alpha);
        for (index, value) in line.iter().enumerate() {
            params_v[index] += value;
        }
    }
    for value in &mut params_v {
        *value /= points.rows() as f64;
    }

    (params_u, params_v)
}

/// Knot vector from interpolation parameters, Park (2000).
pub(crate) fn knots_from_curve_parameters(
    params: &mut Vec<f64>,
    degree: usize,
    closed_curve: bool,
) -> OcctResult<Vec<f64>> {
    if params.len() < 2 {
        return Err(OcctError::invalid("parameters must contain two or more elements"));
    }

    let mut n_control_points = params.len();
    if closed_curve {
        n_control_points += degree - 1;
    }
    let n_inner_knots = n_control_points - degree + 1;

    let mut inner_knots = vec![0.0; n_inner_knots];
    inner_knots[0] = params[0];
    inner_knots[n_inner_knots - 1] = params[params.len() - 1];

    if closed_curve && degree % 2 == 0 {
        let m = params.len() - 2;
        let mut deltas = vec![0.0; m + 1];
        for index in 0..=m {
            deltas[index] = params[index + 1] - params[index];
        }
        inner_knots[1] = inner_knots[0] + 0.5 * (deltas[0] + deltas[m]);
        for index in 1..m {
            inner_knots[index + 1] = inner_knots[index] + 0.5 * (deltas[index - 1] + deltas[index]);
        }
        for value in params.iter_mut() {
            *value += deltas[m] / 2.0;
        }
    } else if closed_curve {
        if inner_knots.len() != params.len() {
            return Err(OcctError::invalid(
                "inner knots size must match parameters size for closed curves",
            ));
        }
        inner_knots = params.clone();
    } else {
        for j in 1..params.len() - degree {
            let sum: f64 = params[j..j + degree].iter().sum();
            inner_knots[j] = sum / degree as f64;
        }
    }

    let mut knots = Vec::new();
    if closed_curve {
        let offset = inner_knots[0] - inner_knots[n_inner_knots - 1];
        for index in 0..degree {
            knots.push(offset + inner_knots[n_inner_knots - degree - 1 + index]);
        }
        knots.extend_from_slice(&inner_knots);
        for index in 0..degree {
            knots.push(-offset + inner_knots[index + 1]);
        }
    } else {
        for _ in 0..degree {
            knots.push(inner_knots[0]);
        }
        knots.extend_from_slice(&inner_knots);
        for _ in 0..degree {
            knots.push(inner_knots[n_inner_knots - 1]);
        }
    }

    if closed_curve && degree <= 1 {
        let count = knots.len();
        knots[0] = knots[1];
        knots[count - 1] = knots[count - 2];
    }

    Ok(knots)
}

/// B-spline basis (or `deriv_order`-th derivative) of every control point at every parameter.
pub(crate) fn bspline_basis_mat(
    degree: i32,
    flat_knots: &[f64],
    params: &[f64],
    deriv_order: i32,
) -> OcctResult<Matrix> {
    let n_control_points = flat_knots.len() as i32 - degree - 1;
    let mut basis = Matrix::zeros(params.len(), n_control_points.max(0) as usize);
    let knots = real_array(flat_knots)?;
    let mut evaluated = math_Matrix_new_int4(1, deriv_order + 1, 1, degree + 1)?;

    for (row, parameter) in params.iter().enumerate() {
        let mut span_index = 0i32;
        let mut adjusted = 0.0f64;
        BSplCLib::LocateParameter_int_array1ofreal_real_bool_int3_real(
            degree,
            &knots,
            *parameter,
            false,
            degree + 1,
            flat_knots.len() as i32 - degree,
            &mut span_index,
            &mut adjusted,
        )?;
        let mut first_non_zero = 0i32;
        BSplCLib::EvalBsplineBasis(
            deriv_order,
            degree + 1,
            &knots,
            *parameter,
            &mut first_non_zero,
            evaluated.pin_mut(),
            false,
        )?;
        for offset in 0..=degree {
            let column = span_index - degree - 1 + offset;
            if column >= 0 && column < n_control_points {
                let value = *evaluated.Value_int2(deriv_order + 1, offset + 1)?;
                basis.set(row, column as usize, value);
            }
        }
    }

    Ok(basis)
}

/// Inserts `knot` into a (knots, multiplicities) pair, capping multiplicity at the degree.
pub(crate) fn insert_knot_with_multiplicity(
    knot: f64,
    count: i32,
    degree: i32,
    knots: &mut Vec<f64>,
    multiplicities: &mut Vec<i32>,
    tolerance: f64,
) -> OcctResult<()> {
    let first = knots[0];
    let last = knots[knots.len() - 1];
    if knot < first - tolerance || knot > last + tolerance {
        return Err(OcctError::invalid("knot out of range"));
    }

    if let Some(position) = knots.iter().position(|value| (value - knot).abs() < tolerance) {
        multiplicities[position] = (multiplicities[position] + count).min(degree);
        return Ok(());
    }

    let mut index = 0;
    while index < knots.len() && knots[index] < knot {
        index += 1;
    }
    knots.insert(index, knot);
    multiplicities.insert(index, count.min(degree));
    Ok(())
}

/// ocp_gordon's `_convert_to_bspline`: conics go through a C2 approximation whose error budget
/// scales with the curve, everything else through `GeomConvert::CurveToBSplineCurve`.
pub(crate) fn convert_to_bspline(curve: &Handle_Geom_Curve) -> OcctResult<Curve> {
    if is_conic(curve)? {
        let geometry = Handle_Geom_Curve_get(curve)?;
        let first = geometry.FirstParameter()?;
        let last = geometry.LastParameter()?;
        let start = point_of(&*Geom_Curve_EvalD0(geometry, first)?)?;
        let mut curve_size = 0.0f64;
        for step in 1..3 {
            let fraction = step as f64 / 4.0;
            let parameter = (1.0 - fraction) * first + fraction * last;
            let point = point_of(&*Geom_Curve_EvalD0(geometry, parameter)?)?;
            curve_size = curve_size.max(distance(start, point));
        }

        let tolerance = Precision::Approximation()? * curve_size / 200.0;
        let approximation = GeomConvert_ApproxCurve_new_hgeom_curve_real_geomabs_shape_int2(
            curve,
            tolerance,
            GeomAbs_Shape::GeomAbs_C2,
            64,
            5,
        )?;
        if approximation.HasResult()? && approximation.MaxError()? < tolerance {
            return Ok(Curve::from_handle(GeomConvert_ApproxCurve_Curve(&approximation)?));
        }
    }
    Curve::from_curve(curve)
}

fn is_conic(curve: &Handle_Geom_Curve) -> OcctResult<bool> {
    let geometry = Handle_Geom_Curve_get(curve)?;
    if Geom_Curve_IsKind_str(geometry, "Geom_Conic")? {
        return Ok(true);
    }
    if !Geom_Curve_IsKind_str(geometry, "Geom_TrimmedCurve")? {
        return Ok(false);
    }
    let trimmed = Handle_Geom_TrimmedCurve_from_Geom_Curve(curve);
    let basis = Geom_TrimmedCurve_BasisCurve(Handle_Geom_TrimmedCurve_get(&trimmed)?)?;
    Ok(Geom_Curve_IsKind_str(Handle_Geom_Curve_get(&basis)?, "Geom_Conic")?)
}
