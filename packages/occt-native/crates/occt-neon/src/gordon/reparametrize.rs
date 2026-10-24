//! Port of ocp_gordon `BSplineAlgorithms.reparametrize_bspline_continuously_approx` (Apache-2.0,
//! SPDX-FileCopyrightText: 2018 German Aerospace Center (DLR)): re-fits a curve so that a list of
//! old parameters lands on a list of new ones, keeping kinks sharp.

use opencascade_sys::{
    geom2d::{
        Geom2d_BSplineCurve_EvalD0, Handle_Geom2d_BSplineCurve_get,
        Handle_Geom2d_BSplineCurve_to_Geom2d_Curve,
    },
    geom2d_api::{
        Geom2dAPI_Interpolate_new_hharray1ofpnt2d_hharray1ofreal_bool_real,
        Geom2dAPI_ProjectPointOnCurve_new_pnt2d_hcurve,
    },
    gp::gp_Pnt2d_new_real2,
    t_col_std::{
        Handle_TColStd_HArray1OfReal_get_mut, TColStd_HArray1OfReal_new,
        TColStd_HArray1OfReal_set_value,
    },
    t_colgp::{
        Handle_TColgp_HArray1OfPnt2d_get_mut, TColgp_HArray1OfPnt2d_new,
        TColgp_HArray1OfPnt2d_set_value,
    },
};

use crate::error::{OcctError, OcctResult};
use crate::gordon::approx_interp::{ApproxResult, BSplineApproxInterp};
use crate::gordon::bspline_algorithms::{kink_parameters, linspace_with_breaks};
use crate::gordon::curve::Curve;

const PARAMETER_TOLERANCE: f64 = 1e-10;

fn index_within_tolerance(values: &[f64], target: f64, tolerance: f64) -> Option<usize> {
    values.iter().position(|value| (value - target).abs() < tolerance)
}

/// Re-approximates `spline` so that `old_parameters` map onto `new_parameters`.
pub(crate) fn reparametrize_bspline_continuously_approx(
    spline: &Curve,
    old_parameters: &[f64],
    new_parameters: &[f64],
    n_control_points: usize,
) -> OcctResult<ApproxResult> {
    if old_parameters.len() != new_parameters.len() {
        return Err(OcctError::invalid("parameter sizes don't match"));
    }

    let reparametrizing_spline = interpolate_parameter_map(old_parameters, new_parameters)?;
    let reparametrizing_curve = Handle_Geom2d_BSplineCurve_to_Geom2d_Curve(&reparametrizing_spline);

    let mut kinks = kink_parameters(spline)?;
    for kink in &mut kinks {
        let point = gp_Pnt2d_new_real2(*kink, 0.0)?;
        let projection =
            Geom2dAPI_ProjectPointOnCurve_new_pnt2d_hcurve(&point, &reparametrizing_curve)?;
        *kink = projection.LowerDistanceParameter()?;
    }

    let breaks: Vec<f64> = new_parameters[1..new_parameters.len() - 1]
        .iter()
        .copied()
        .filter(|value| index_within_tolerance(&kinks, *value, PARAMETER_TOLERANCE).is_none())
        .collect();

    let first = new_parameters[0];
    let last = new_parameters[new_parameters.len() - 1];
    let sample_count = 101.max(n_control_points * 2);
    let mut parameters = linspace_with_breaks(first, last, sample_count, &breaks);
    for kink in &kinks {
        let position = parameters.partition_point(|value| value < kink);
        parameters.insert(position, *kink);
    }

    let geometry = Handle_Geom2d_BSplineCurve_get(&reparametrizing_spline)?;
    let mut points = Vec::with_capacity(parameters.len());
    for parameter in &parameters {
        let mapped = Geom2d_BSplineCurve_EvalD0(geometry, *parameter)?.X()?;
        points.push(spline.value(mapped)?);
    }

    let make_continuous = spline.is_closed()?
        && spline.derivative_angle(spline.first_parameter()?, spline.last_parameter()?, 1)?
            < 6.0 / 180.0 * std::f64::consts::PI;

    let mut approximation = BSplineApproxInterp::new(points, n_control_points, 3, make_continuous);

    let mut pinned = Vec::with_capacity(breaks.len() + 2);
    pinned.push(first);
    pinned.extend_from_slice(&breaks);
    pinned.push(last);
    for value in &pinned {
        if let Some(index) = index_within_tolerance(&parameters, *value, PARAMETER_TOLERANCE) {
            approximation.interpolate_point(index, false)?;
        }
    }
    for kink in &kinks {
        if let Some(index) = index_within_tolerance(&parameters, *kink, PARAMETER_TOLERANCE) {
            approximation.interpolate_point(index, true)?;
        }
    }

    approximation.fit_curve_optimal(&parameters)
}

/// The 2D curve that maps old parameters (as x coordinates) to new ones (as its own parameter).
fn interpolate_parameter_map(
    old_parameters: &[f64],
    new_parameters: &[f64],
) -> OcctResult<cxx::UniquePtr<opencascade_sys::geom2d::Handle_Geom2d_BSplineCurve>> {
    let mut points = TColgp_HArray1OfPnt2d_new(1, old_parameters.len() as i32)?;
    for (index, parameter) in old_parameters.iter().enumerate() {
        let point = gp_Pnt2d_new_real2(*parameter, 0.0)?;
        TColgp_HArray1OfPnt2d_set_value(
            Handle_TColgp_HArray1OfPnt2d_get_mut(points.pin_mut())?,
            index as i32 + 1,
            &point,
        )?;
    }

    let mut parameters = TColStd_HArray1OfReal_new(1, new_parameters.len() as i32)?;
    for (index, parameter) in new_parameters.iter().enumerate() {
        TColStd_HArray1OfReal_set_value(
            Handle_TColStd_HArray1OfReal_get_mut(parameters.pin_mut())?,
            index as i32 + 1,
            *parameter,
        )?;
    }

    let mut interpolation = Geom2dAPI_Interpolate_new_hharray1ofpnt2d_hharray1ofreal_bool_real(
        &points,
        &parameters,
        false,
        1e-6,
    )?;
    interpolation.pin_mut().Perform()?;
    if !interpolation.IsDone()? {
        return Err(OcctError::failed("cannot reparametrize curve"));
    }
    Ok(opencascade_sys::geom2d::Handle_Geom2d_BSplineCurve_clone(interpolation.Curve()?))
}
