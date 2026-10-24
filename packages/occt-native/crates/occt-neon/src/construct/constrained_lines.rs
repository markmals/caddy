//! Straight lines constrained by tangency to curves, incidence with a point, or an angle to a
//! reference line (`Geom2dGcc_Lin2d2Tan`, `Geom2dGcc_Lin2dTanObl`; build123d's
//! `Edge.make_constrained_lines`).

use neon::prelude::*;
use opencascade_sys::{
    geom2d::{Geom2d_Line_new_lin2d, Handle_Geom2d_Line_to_Geom2d_Curve},
    geom2d_api::{Geom2dAPI_InterCurveCurve_Point, Geom2dAPI_InterCurveCurve_new_hcurve2_real},
    geom2d_gcc::{
        Geom2dGcc_Lin2d2Tan_ThisSolution, Geom2dGcc_Lin2d2Tan_new_qualifiedcurve_pnt2d_real,
        Geom2dGcc_Lin2d2Tan_new_qualifiedcurve2_real,
        Geom2dGcc_Lin2dTanObl_new_qualifiedcurve_lin2d_real2,
    },
    gp::{
        gp_Ax2d_new_pnt2d_dir2d, gp_Dir2d_new_real2, gp_Lin2d_new_ax2d, gp_Lin2d_new_pnt2d_dir2d,
        gp_Pnt2d_new_real2,
    },
    int_ana2d::IntAna2d_AnaIntersection_new_lin2d2,
};

use crate::{
    construct::{
        TOLERANCE,
        geom2d::{Contact, Tangency, distance_to, line_edge, point_coordinates, tangencies},
    },
    error::{OcctError, OcctResult, OrThrow, attempt},
    shape::{shapes_from_js, shapes_to_js},
};

/// The one intersection of a solution line with a tangency curve: where it touches it.
fn touch_point(
    line: &opencascade_sys::geom2d::Handle_Geom2d_Curve,
    curve: &opencascade_sys::geom2d::Handle_Geom2d_Curve,
) -> OcctResult<Option<[f64; 2]>> {
    let intersection = Geom2dAPI_InterCurveCurve_new_hcurve2_real(line, curve, TOLERANCE)?;
    if intersection.NbPoints()? == 0 {
        return Ok(None);
    }
    let point = Geom2dAPI_InterCurveCurve_Point(&intersection, 1)?;
    Ok(Some([point.X()?, point.Y()?]))
}

/// Lines tangent to a curve and to a second curve or through a point (`Geom2dGcc_Lin2d2Tan`),
/// trimmed between the two contacts.
#[neon::export(name = "constrainedLines2Tan")]
fn constrained_lines_2tan<'cx>(
    cx: &mut Cx<'cx>,
    edges: Handle<'cx, JsArray>,
    qualifiers: Vec<f64>,
    points: Vec<f64>,
) -> JsResult<'cx, JsArray> {
    let edges = shapes_from_js(cx, edges)?;
    let lines = attempt(|| {
        let targets = tangencies(&edges, &qualifiers, &points)?;
        let [one, two] = &targets[..] else {
            return Err(OcctError::invalid("exactly two tangency targets are required"));
        };
        let first = one.curve()?;
        let gcc = match two {
            Tangency::Curve(second) => Geom2dGcc_Lin2d2Tan_new_qualifiedcurve2_real(
                &first.qualified,
                &second.qualified,
                TOLERANCE,
            )?,
            Tangency::Point(point) => {
                let point = point_coordinates(point)?;
                Geom2dGcc_Lin2d2Tan_new_qualifiedcurve_pnt2d_real(
                    &first.qualified,
                    &*gp_Pnt2d_new_real2(point[0], point[1])?,
                    TOLERANCE,
                )?
            }
        };
        if !gcc.IsDone()? || gcc.NbSolutions()? == 0 {
            return Err(OcctError::failed("no line is tangent to both targets"));
        }

        let mut lines = Vec::new();
        for index in 1..=gcc.NbSolutions()? {
            let solution = Geom2dGcc_Lin2d2Tan_ThisSolution(&gcc, index)?;
            let solution_line = Geom2d_Line_new_lin2d(&solution)?;
            let line = Handle_Geom2d_Line_to_Geom2d_Curve(&solution_line);
            let Some(from) = touch_point(&line, &first.curve)? else {
                continue;
            };
            let to = match two {
                Tangency::Curve(second) => touch_point(&line, &second.curve)?,
                Tangency::Point(point) => Some(point_coordinates(point)?),
            };
            let Some(to) = to else { continue };
            let separation = distance_to(from, to);
            if separation.is_nan() || separation < TOLERANCE {
                continue;
            }
            lines.push(line_edge(from, to)?);
        }
        Ok(lines)
    })
    .or_raise(cx)?;
    shapes_to_js(cx, lines)
}

/// Lines tangent to a curve at `angle` radians to the reference line `[x, y, dx, dy]`
/// (`Geom2dGcc_Lin2dTanObl`), trimmed between the contact and the reference line.
#[neon::export(name = "constrainedLinesTanOblique")]
fn constrained_lines_tan_oblique<'cx>(
    cx: &mut Cx<'cx>,
    edges: Handle<'cx, JsArray>,
    qualifiers: Vec<f64>,
    reference: Vec<f64>,
    angle: f64,
) -> JsResult<'cx, JsArray> {
    let edges = shapes_from_js(cx, edges)?;
    let lines = attempt(|| {
        let targets = tangencies(&edges, &qualifiers, &[])?;
        let [only] = &targets[..] else {
            return Err(OcctError::invalid("exactly one tangency curve is required"));
        };
        let curve = only.curve()?;
        let [x, y, dx, dy] = reference[..] else {
            return Err(OcctError::invalid("reference line must be [x, y, dx, dy]"));
        };

        let axis =
            gp_Ax2d_new_pnt2d_dir2d(&*gp_Pnt2d_new_real2(x, y)?, &*gp_Dir2d_new_real2(dx, dy)?)?;
        let reference_line = gp_Lin2d_new_ax2d(&axis)?;
        let direction = dy.atan2(dx) + angle;
        let line_direction = gp_Dir2d_new_real2(direction.cos(), direction.sin())?;

        let gcc = Geom2dGcc_Lin2dTanObl_new_qualifiedcurve_lin2d_real2(
            &curve.qualified,
            &reference_line,
            TOLERANCE,
            angle,
        )?;
        if !gcc.IsDone()? || gcc.NbSolutions()? == 0 {
            return Err(OcctError::failed("no line is tangent to the curve at that angle"));
        }

        let mut lines = Vec::new();
        for index in 1..=gcc.NbSolutions()? {
            let mut probe = gp_Pnt2d_new_real2(0.0, 0.0)?;
            let mut touch = Contact::default();
            gcc.Tangency1(index, &mut touch.on_circle, &mut touch.on_target, probe.pin_mut())?;
            let from = [probe.X()?, probe.Y()?];

            let tangent_line = gp_Lin2d_new_pnt2d_dir2d(&probe, &line_direction)?;
            let crossing = IntAna2d_AnaIntersection_new_lin2d2(&tangent_line, &reference_line)?;
            if !crossing.IsDone()? || crossing.NbPoints()? == 0 {
                continue;
            }
            let meeting = crossing.Point(1)?.Value()?;
            let to = [meeting.X()?, meeting.Y()?];

            let separation = distance_to(from, to);
            if separation.is_nan() || separation < TOLERANCE {
                continue;
            }
            lines.push(line_edge(from, to)?);
        }
        Ok(lines)
    })
    .or_raise(cx)?;
    shapes_to_js(cx, lines)
}
