//! Edges from free-form curves: interpolated and approximated B-splines, Bezier curves and
//! exact B-splines from control points.

use cxx::UniquePtr;
use neon::prelude::*;
use opencascade_sys::{
    geom::{
        Geom_BSplineCurve_new_array1ofpnt_array1ofreal_array1ofinteger_int_bool,
        Geom_BSplineCurve_new_array1ofpnt_array1ofreal2_array1ofinteger_int_bool2,
        Geom_BezierCurve_new_array1ofpnt, Geom_BezierCurve_new_array1ofpnt_array1ofreal,
        Handle_Geom_BSplineCurve_to_Geom_Curve, Handle_Geom_BezierCurve_to_Geom_Curve,
    },
    geom_abs::GeomAbs_Shape,
    geom_api::{
        GeomAPI_Interpolate, GeomAPI_Interpolate_new_hharray1ofpnt_bool_real,
        GeomAPI_Interpolate_new_hharray1ofpnt_hharray1ofreal_bool_real,
        GeomAPI_PointsToBSpline_new_array1ofpnt_int2_shape_real,
        GeomAPI_PointsToBSpline_new_array1ofpnt_real3_int_shape_real,
    },
    gp::gp_Pnt,
    t_col_std::{
        Handle_TColStd_HArray1OfBoolean, Handle_TColStd_HArray1OfBoolean_get_mut,
        Handle_TColStd_HArray1OfReal, Handle_TColStd_HArray1OfReal_get_mut,
        TColStd_Array1OfInteger_new, TColStd_Array1OfInteger_set_value,
        TColStd_HArray1OfBoolean_new, TColStd_HArray1OfBoolean_set_value,
        TColStd_HArray1OfReal_new, TColStd_HArray1OfReal_set_value,
    },
    t_colgp::{
        Handle_TColgp_HArray1OfPnt, Handle_TColgp_HArray1OfPnt_get_mut, TColgp_Array1OfVec_new,
        TColgp_Array1OfVec_set_value, TColgp_HArray1OfPnt_new, TColgp_HArray1OfPnt_set_value,
    },
};

use crate::{
    construct::{edge_from_curve, point_array, points, real_array},
    convert::vector,
    error::{OcctError, OcctResult, OrThrow, attempt},
    shape::{ShapeResult, boxed},
};

fn point_handle(points: &[UniquePtr<gp_Pnt>]) -> OcctResult<UniquePtr<Handle_TColgp_HArray1OfPnt>> {
    let mut handle = TColgp_HArray1OfPnt_new(1, points.len() as i32)?;
    for (index, point) in points.iter().enumerate() {
        let array = Handle_TColgp_HArray1OfPnt_get_mut(handle.pin_mut())?;
        TColgp_HArray1OfPnt_set_value(array, index as i32 + 1, point)?;
    }
    Ok(handle)
}

fn real_handle(values: &[f64]) -> OcctResult<UniquePtr<Handle_TColStd_HArray1OfReal>> {
    let mut handle = TColStd_HArray1OfReal_new(1, values.len() as i32)?;
    for (index, value) in values.iter().enumerate() {
        let array = Handle_TColStd_HArray1OfReal_get_mut(handle.pin_mut())?;
        TColStd_HArray1OfReal_set_value(array, index as i32 + 1, *value)?;
    }
    Ok(handle)
}

fn flag_handle(flags: &[bool]) -> OcctResult<UniquePtr<Handle_TColStd_HArray1OfBoolean>> {
    let mut handle = TColStd_HArray1OfBoolean_new(1, flags.len() as i32)?;
    for (index, flag) in flags.iter().enumerate() {
        let array = Handle_TColStd_HArray1OfBoolean_get_mut(handle.pin_mut())?;
        TColStd_HArray1OfBoolean_set_value(array, index as i32 + 1, *flag)?;
    }
    Ok(handle)
}

/// Applies build123d's tangent rules: a pair of tangents for a longer point list constrains only
/// the ends; otherwise one tangent per point, each enabled by its flag.
fn load_tangents(
    builder: &mut UniquePtr<GeomAPI_Interpolate>,
    tangents: &[f64],
    flags: &[f64],
    point_count: usize,
    scale: bool,
) -> OcctResult<()> {
    let vectors = tangents.chunks_exact(3).map(vector).collect::<OcctResult<Vec<_>>>()?;
    if vectors.len() == 2 && point_count != 2 {
        let (first, last) = (&vectors[0], &vectors[1]);
        return Ok(builder.pin_mut().Load_vec2_bool(first, last, scale)?);
    }
    if vectors.len() != point_count {
        return Err(OcctError::invalid(format!(
            "there must be one tangent for each interpolation point, or just two end point \
             tangents. Tangent count: {}, point count: {point_count}",
            vectors.len()
        )));
    }
    let enabled: Vec<bool> = if flags.is_empty() {
        vec![true; vectors.len()]
    } else {
        flags.iter().map(|f| *f != 0.0).collect()
    };
    if enabled.len() != vectors.len() {
        return Err(OcctError::invalid("one tangent flag is required for each tangent"));
    }
    let mut array = TColgp_Array1OfVec_new(1, vectors.len() as i32)?;
    for (index, tangent) in vectors.iter().enumerate() {
        TColgp_Array1OfVec_set_value(array.pin_mut(), index as i32 + 1, tangent)?;
    }
    let flag_array = flag_handle(&enabled)?;
    Ok(builder.pin_mut().Load_array1ofvec_hharray1ofboolean_bool(&array, &flag_array, scale)?)
}

/// Interpolating B-spline through `points` (build123d `Edge.make_spline`). `tangents` is a flat
/// coordinate array holding either two end tangents or one per point; `tangentFlags` disables
/// individual tangents and `parameters` fixes the curve parameter at each point.
#[neon::export(name = "makeSplineEdge")]
#[allow(clippy::too_many_arguments)]
fn make_spline_edge<'cx>(
    cx: &mut Cx<'cx>,
    points_flat: Vec<f64>,
    tangents: Vec<f64>,
    tangent_flags: Vec<f64>,
    parameters: Vec<f64>,
    periodic: bool,
    scale: bool,
    tolerance: f64,
) -> ShapeResult {
    attempt(|| {
        let interpolation_points = points(&points_flat, "spline points")?;
        if tangents.len() % 3 != 0 {
            return Err(OcctError::invalid("spline tangents must be whole 3D vectors"));
        }
        let handle = point_handle(&interpolation_points)?;
        let mut builder = if parameters.is_empty() {
            GeomAPI_Interpolate_new_hharray1ofpnt_bool_real(&handle, periodic, tolerance)?
        } else {
            let expected = interpolation_points.len() + usize::from(periodic);
            if parameters.len() != expected {
                return Err(OcctError::invalid(format!(
                    "there must be one parameter for each interpolation point (plus one if \
                     periodic), or none specified. Parameter count: {}, point count: {}",
                    parameters.len(),
                    interpolation_points.len()
                )));
            }
            GeomAPI_Interpolate_new_hharray1ofpnt_hharray1ofreal_bool_real(
                &handle,
                &*real_handle(&parameters)?,
                periodic,
                tolerance,
            )?
        };
        if !tangents.is_empty() {
            load_tangents(
                &mut builder,
                &tangents,
                &tangent_flags,
                interpolation_points.len(),
                scale,
            )?;
        }
        builder.pin_mut().Perform()?;
        if !builder.IsDone()? {
            return Err(OcctError::failed("B-spline interpolation failed"));
        }
        boxed(edge_from_curve(&Handle_Geom_BSplineCurve_to_Geom_Curve(builder.Curve()?))?)
    })
    .or_raise(cx)
}

/// Approximating B-spline (build123d `Edge.make_spline_approx`). `smoothing` is empty or the
/// three variational weights; with smoothing the degree is raised to at least 6, the lowest
/// degree OCCT's C2 Jacobi basis accepts.
#[neon::export(name = "makeSplineApproxEdge")]
fn make_spline_approx_edge<'cx>(
    cx: &mut Cx<'cx>,
    points_flat: Vec<f64>,
    tolerance: f64,
    smoothing: Vec<f64>,
    min_degree: f64,
    max_degree: f64,
) -> ShapeResult {
    attempt(|| {
        let approximated = points(&points_flat, "spline points")?;
        let array = point_array(&approximated)?;
        let (min_degree, max_degree) = (min_degree as i32, max_degree as i32);
        let builder = match smoothing.len() {
            0 => GeomAPI_PointsToBSpline_new_array1ofpnt_int2_shape_real(
                &array,
                min_degree,
                max_degree,
                GeomAbs_Shape::GeomAbs_C2,
                tolerance,
            )?,
            3 => GeomAPI_PointsToBSpline_new_array1ofpnt_real3_int_shape_real(
                &array,
                smoothing[0],
                smoothing[1],
                smoothing[2],
                max_degree.max(6),
                GeomAbs_Shape::GeomAbs_C2,
                tolerance,
            )?,
            other => {
                return Err(OcctError::invalid(format!(
                    "smoothing needs exactly three weights, got {other}"
                )));
            }
        };
        if !builder.IsDone()? {
            return Err(OcctError::failed("B-spline approximation failed"));
        }
        boxed(edge_from_curve(&Handle_Geom_BSplineCurve_to_Geom_Curve(builder.Curve()?))?)
    })
    .or_raise(cx)
}

/// Rational (weighted) or plain Bezier curve through its control points.
#[neon::export(name = "makeBezierEdge")]
fn make_bezier_edge<'cx>(
    cx: &mut Cx<'cx>,
    points_flat: Vec<f64>,
    weights: Vec<f64>,
) -> ShapeResult {
    attempt(|| {
        let poles = points(&points_flat, "control points")?;
        if poles.len() < 2 {
            return Err(OcctError::invalid(
                "at least two control points must be provided (start, end)",
            ));
        }
        if poles.len() > 25 {
            return Err(OcctError::invalid("the maximum number of control points is 25"));
        }
        if !weights.is_empty() && weights.len() != poles.len() {
            return Err(OcctError::invalid("a weight must be provided for each control point"));
        }
        let array = point_array(&poles)?;
        let curve = if weights.is_empty() {
            Geom_BezierCurve_new_array1ofpnt(&array)?
        } else {
            Geom_BezierCurve_new_array1ofpnt_array1ofreal(&array, &*real_array(&weights)?)?
        };
        boxed(edge_from_curve(&Handle_Geom_BezierCurve_to_Geom_Curve(&curve))?)
    })
    .or_raise(cx)
}

/// Collapses a knot sequence with repeats into distinct knots and their multiplicities.
fn knot_multiplicities(knots: &[f64]) -> (Vec<f64>, Vec<i32>) {
    let mut distinct = vec![knots[0]];
    let mut multiplicities = vec![1];
    for knot in &knots[1..] {
        let last = *distinct.last().unwrap_or(knot);
        if (knot - last).abs() <= super::TOLERANCE {
            if let Some(count) = multiplicities.last_mut() {
                *count += 1;
            }
        } else {
            distinct.push(*knot);
            multiplicities.push(1);
        }
    }
    (distinct, multiplicities)
}

/// Exact B-spline from poles and a knot sequence (build123d `Edge.make_bspline`).
#[neon::export(name = "makeBsplineEdge")]
fn make_bspline_edge<'cx>(
    cx: &mut Cx<'cx>,
    points_flat: Vec<f64>,
    knots: Vec<f64>,
    degree: f64,
    weights: Vec<f64>,
    periodic: bool,
) -> ShapeResult {
    attempt(|| {
        if knots.is_empty() {
            return Err(OcctError::invalid("B-spline requires at least one knot"));
        }
        let poles = point_array(&points(&points_flat, "control points")?)?;
        let (distinct, multiplicities) = knot_multiplicities(&knots);
        let knot_array = real_array(&distinct)?;
        let mut multiplicity_array = TColStd_Array1OfInteger_new(1, multiplicities.len() as i32)?;
        for (index, multiplicity) in multiplicities.iter().enumerate() {
            TColStd_Array1OfInteger_set_value(
                multiplicity_array.pin_mut(),
                index as i32 + 1,
                *multiplicity,
            )?;
        }
        let curve = if weights.is_empty() {
            Geom_BSplineCurve_new_array1ofpnt_array1ofreal_array1ofinteger_int_bool(
                &poles,
                &knot_array,
                &multiplicity_array,
                degree as i32,
                periodic,
            )?
        } else {
            Geom_BSplineCurve_new_array1ofpnt_array1ofreal2_array1ofinteger_int_bool2(
                &poles,
                &*real_array(&weights)?,
                &knot_array,
                &multiplicity_array,
                degree as i32,
                periodic,
                true,
            )?
        };
        boxed(edge_from_curve(&Handle_Geom_BSplineCurve_to_Geom_Curve(&curve))?)
    })
    .or_raise(cx)
}
