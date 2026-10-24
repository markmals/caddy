//! Whole circles constrained by one tangency plus a fixed centre or a centre locus
//! (`Geom2dGcc_Circ2dTanCen`, `Geom2dGcc_Circ2dTanOnRad`). A single tangency leaves no second
//! contact to trim an arc between, so these solvers return closed edges.

use neon::prelude::*;
use opencascade_sys::{
    geom2d_adaptor::Handle_Geom2dAdaptor_Curve_get,
    geom2d_api::Geom2dAPI_ProjectPointOnCurve_new_pnt2d_hcurve,
    geom2d_gcc::{
        Geom2dGcc_Circ2dTanCen_ThisSolution, Geom2dGcc_Circ2dTanCen_new_qualifiedcurve_hpoint_real,
        Geom2dGcc_Circ2dTanOnRad_ThisSolution, Geom2dGcc_Circ2dTanOnRad_new_hpoint_curve_real2,
        Geom2dGcc_Circ2dTanOnRad_new_qualifiedcurve_curve_real2,
    },
    gp::{
        gp_Ax2d_new_pnt2d_dir2d, gp_Circ2d_new_ax2d_real_bool, gp_Dir2d_new_real2,
        gp_Pnt2d_new_real2,
    },
};

use crate::{
    construct::{
        TOLERANCE,
        geom2d::{
            Contact, Tangency, cartesian_point, circle_edge, distance_to, point_coordinates,
            point_handle, qualified_edge, qualifier, tangencies,
        },
        positive,
    },
    error::{OcctError, OcctResult, OrThrow, attempt},
    shape::{ShapeCell, get, shapes_from_js, shapes_to_js},
};

fn single_target(targets: &[Tangency]) -> OcctResult<&Tangency> {
    match targets {
        [only] => Ok(only),
        _ => Err(OcctError::invalid("exactly one tangency target is required")),
    }
}

fn center_of(values: &[f64]) -> OcctResult<[f64; 2]> {
    match values {
        [x, y] => Ok([*x, *y]),
        _ => Err(OcctError::invalid("center must be an [x, y] pair")),
    }
}

/// Circles centred on `center` and tangent to one target (`Geom2dGcc_Circ2dTanCen`). A point
/// target gives the one circle through it.
#[neon::export(name = "constrainedCirclesTanCen")]
fn constrained_circles_tan_cen<'cx>(
    cx: &mut Cx<'cx>,
    edges: Handle<'cx, JsArray>,
    qualifiers: Vec<f64>,
    points: Vec<f64>,
    center: Vec<f64>,
) -> JsResult<'cx, JsArray> {
    let edges = shapes_from_js(cx, edges)?;
    let circles = attempt(|| {
        let targets = tangencies(&edges, &qualifiers, &points)?;
        let target = single_target(&targets)?;
        let center = center_of(&center)?;

        if let Tangency::Point(point) = target {
            let radius = distance_to(point_coordinates(point)?, center);
            if radius <= TOLERANCE {
                return Ok(Vec::new());
            }
            let axis = gp_Ax2d_new_pnt2d_dir2d(
                &*gp_Pnt2d_new_real2(center[0], center[1])?,
                &*gp_Dir2d_new_real2(1.0, 0.0)?,
            )?;
            let circle = gp_Circ2d_new_ax2d_real_bool(&axis, radius, true)?;
            return Ok(vec![circle_edge(&circle)?]);
        }

        let curve = target.curve()?;
        let center_point = cartesian_point(center[0], center[1])?;
        let fixed_center = point_handle(&center_point);
        let gcc = Geom2dGcc_Circ2dTanCen_new_qualifiedcurve_hpoint_real(
            &curve.qualified,
            &fixed_center,
            TOLERANCE,
        )?;
        if !gcc.IsDone()? || gcc.NbSolutions()? == 0 {
            return Err(OcctError::failed("no circle with that center is tangent to the target"));
        }

        let mut circles = Vec::new();
        for index in 1..=gcc.NbSolutions()? {
            let circle = Geom2dGcc_Circ2dTanCen_ThisSolution(&gcc, index)?;
            let mut probe = gp_Pnt2d_new_real2(0.0, 0.0)?;
            let mut touch = Contact::default();
            gcc.Tangency1(index, &mut touch.on_circle, &mut touch.on_target, probe.pin_mut())?;
            if !curve.contains(touch.on_target)? {
                continue;
            }
            circles.push(circle_edge(&circle)?);
        }
        Ok(circles)
    })
    .or_raise(cx)?;
    shapes_to_js(cx, circles)
}

/// Circles of `radius` tangent to one target with their centre on `centerOn`
/// (`Geom2dGcc_Circ2dTanOnRad`).
#[neon::export(name = "constrainedCirclesTanOnRad")]
fn constrained_circles_tan_on_rad<'cx>(
    cx: &mut Cx<'cx>,
    edges: Handle<'cx, JsArray>,
    qualifiers: Vec<f64>,
    points: Vec<f64>,
    center_on: &ShapeCell,
    radius: f64,
) -> JsResult<'cx, JsArray> {
    let edges = shapes_from_js(cx, edges)?;
    let circles = attempt(|| {
        positive(radius, "circle radius")?;
        let targets = tangencies(&edges, &qualifiers, &points)?;
        let target = single_target(&targets)?;
        let locus_shape = get(center_on)?;
        let locus = qualified_edge(&locus_shape, qualifier(0.0)?)?;
        let adaptor = Handle_Geom2dAdaptor_Curve_get(&locus.adaptor)?;
        let gcc = match target {
            Tangency::Curve(curve) => Geom2dGcc_Circ2dTanOnRad_new_qualifiedcurve_curve_real2(
                &curve.qualified,
                adaptor,
                radius,
                TOLERANCE,
            )?,
            Tangency::Point(_) => Geom2dGcc_Circ2dTanOnRad_new_hpoint_curve_real2(
                &*target.as_point()?,
                adaptor,
                radius,
                TOLERANCE,
            )?,
        };
        if !gcc.IsDone()? || gcc.NbSolutions()? == 0 {
            return Err(OcctError::failed(
                "no circle of that radius is tangent to the target with its center on the curve",
            ));
        }

        let mut circles = Vec::new();
        for index in 1..=gcc.NbSolutions()? {
            let circle = Geom2dGcc_Circ2dTanOnRad_ThisSolution(&gcc, index)?;
            let mut probe = gp_Pnt2d_new_real2(0.0, 0.0)?;
            let mut touch = Contact::default();
            gcc.Tangency1(index, &mut touch.on_circle, &mut touch.on_target, probe.pin_mut())?;
            if !target.contains(touch.on_target)? {
                continue;
            }
            let projection =
                Geom2dAPI_ProjectPointOnCurve_new_pnt2d_hcurve(circle.Location()?, &locus.curve)?;
            if projection.NbPoints()? == 0 || !locus.contains(projection.Parameter_int(1)?)? {
                continue;
            }
            circles.push(circle_edge(&circle)?);
        }
        Ok(circles)
    })
    .or_raise(cx)?;
    shapes_to_js(cx, circles)
}
