//! Helical edges, built the way build123d does: a straight line in the (u, v) domain of a
//! cylindrical or conical surface, wrapped onto it and then given an explicit 3D curve.

use std::f64::consts::TAU;

use cxx::UniquePtr;
use neon::prelude::*;
use opencascade_sys::{
    b_rep_builder_api::{
        BRepBuilderAPI_MakeEdge_as_BRepBuilderAPI_MakeShape_mut,
        BRepBuilderAPI_MakeEdge_new_hcurve_hsurface,
    },
    b_rep_lib::BRepLib,
    geom::{
        Geom_ConicalSurface_new_ax3_real2, Geom_CylindricalSurface_new_ax3_real,
        Handle_Geom_ConicalSurface_to_Geom_Surface, Handle_Geom_CylindricalSurface_to_Geom_Surface,
        Handle_Geom_Surface,
    },
    geom_abs::GeomAbs_Shape,
    geom2d::{
        Geom2d_Line_new_pnt2d_dir2d, Geom2d_TrimmedCurve_new_hcurve_real2_bool2,
        Handle_Geom2d_Line_to_Geom2d_Curve, Handle_Geom2d_TrimmedCurve_to_Geom2d_Curve,
    },
    gp::{gp_Ax3_new_pnt_dir, gp_Dir2d_new_real2, gp_Pnt2d_new_real2},
};

use crate::{
    construct::{build, positive},
    convert::{dir, pnt},
    error::{OcctError, OcctResult, OrThrow, attempt},
    shape::{ShapeResult, boxed},
};

/// The maximum number of segments OCCT may use when converting the surface curve to 3D;
/// build123d raises it from the default so long helices keep their accuracy.
const MAX_SEGMENTS: i32 = 2000;

fn helix_surface(
    center: &[f64],
    normal: &[f64],
    radius: f64,
    cone_angle: f64,
) -> OcctResult<UniquePtr<Handle_Geom_Surface>> {
    let frame = gp_Ax3_new_pnt_dir(&*pnt(center)?, &*dir(normal)?)?;
    if cone_angle == 0.0 {
        let cylinder = Geom_CylindricalSurface_new_ax3_real(&frame, radius)?;
        return Ok(Handle_Geom_CylindricalSurface_to_Geom_Surface(&cylinder));
    }
    let cone = Geom_ConicalSurface_new_ax3_real2(&frame, cone_angle, radius)?;
    Ok(Handle_Geom_ConicalSurface_to_Geom_Surface(&cone))
}

/// Helix of `pitch` per turn rising to `height` around the axis `center`/`normal`. A non-zero
/// `coneAngle` (radians) sweeps the helix over a cone instead of a cylinder.
#[neon::export(name = "makeHelixEdge")]
#[allow(clippy::too_many_arguments)]
fn make_helix_edge<'cx>(
    cx: &mut Cx<'cx>,
    pitch: f64,
    height: f64,
    radius: f64,
    center: Vec<f64>,
    normal: Vec<f64>,
    cone_angle: f64,
    left_hand: bool,
) -> ShapeResult {
    attempt(|| {
        positive(pitch, "helix pitch")?;
        positive(height, "helix height")?;
        if !(radius.is_finite() && radius >= 0.0) {
            return Err(OcctError::invalid("helix radius must be zero or more"));
        }
        if !cone_angle.is_finite() || cone_angle.cos() == 0.0 {
            return Err(OcctError::invalid("helix cone angle must be less than a quarter turn"));
        }
        let surface = helix_surface(&center, &normal, radius, cone_angle)?;

        let turn = if left_hand { -TAU } else { TAU };
        let direction_length = turn.hypot(pitch);
        let (du, dv) = (turn / direction_length, pitch / direction_length);
        let line_length = (height / dv) / cone_angle.cos();

        let line = Geom2d_Line_new_pnt2d_dir2d(
            &*gp_Pnt2d_new_real2(0.0, 0.0)?,
            &*gp_Dir2d_new_real2(du, dv)?,
        )?;
        let trimmed = Geom2d_TrimmedCurve_new_hcurve_real2_bool2(
            &Handle_Geom2d_Line_to_Geom2d_Curve(&line),
            0.0,
            line_length,
            true,
            true,
        )?;

        let mut maker = BRepBuilderAPI_MakeEdge_new_hcurve_hsurface(
            &Handle_Geom2d_TrimmedCurve_to_Geom2d_Curve(&trimmed),
            &surface,
        )?;
        let edge = build(
            BRepBuilderAPI_MakeEdge_as_BRepBuilderAPI_MakeShape_mut(maker.pin_mut()),
            "BRepBuilderAPI_MakeEdge",
        )?;
        BRepLib::BuildCurves3d_shape_real_shape_int2(
            &edge,
            1e-9,
            GeomAbs_Shape::GeomAbs_C1,
            14,
            MAX_SEGMENTS,
        )?;
        boxed(edge)
    })
    .or_raise(cx)
}
