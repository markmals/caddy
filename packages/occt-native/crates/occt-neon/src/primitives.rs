//! Solid primitives (BRepPrimAPI), each placed in a local frame. Angles are in radians.

use neon::prelude::*;
use opencascade_sys::b_rep_prim_api::{
    BRepPrimAPI_MakeBox_new_ax2_real3, BRepPrimAPI_MakeCone_new_ax2_real4,
    BRepPrimAPI_MakeCylinder_new_ax2_real3, BRepPrimAPI_MakeSphere_new_ax2_real4,
    BRepPrimAPI_MakeTorus_new_ax2_real5, BRepPrimAPI_MakeWedge_new_ax2_real7,
};

use crate::{
    builder::finish,
    convert::ax2,
    error::attempt,
    error::{OcctError, OcctResult, OrThrow},
    shape::ShapeResult,
};

fn positive(value: f64, name: &str) -> OcctResult<()> {
    if value > 0.0 && value.is_finite() {
        Ok(())
    } else {
        Err(OcctError::invalid(format!("{name} must be a positive number")))
    }
}

#[neon::export(name = "makeBox")]
fn make_box<'cx>(cx: &mut Cx<'cx>, frame: Vec<f64>, dx: f64, dy: f64, dz: f64) -> ShapeResult {
    let result = attempt(|| {
        positive(dx, "box length")?;
        positive(dy, "box width")?;
        positive(dz, "box height")?;
        let mut maker = BRepPrimAPI_MakeBox_new_ax2_real3(&*ax2(&frame)?, dx, dy, dz)?;
        finish!(maker, "BRepPrimAPI_MakeBox")
    });
    result.or_raise(cx)
}

#[neon::export(name = "makeCylinder")]
fn make_cylinder<'cx>(
    cx: &mut Cx<'cx>,
    frame: Vec<f64>,
    radius: f64,
    height: f64,
    angle: f64,
) -> ShapeResult {
    let result = attempt(|| {
        positive(radius, "cylinder radius")?;
        positive(height, "cylinder height")?;
        let mut maker =
            BRepPrimAPI_MakeCylinder_new_ax2_real3(&*ax2(&frame)?, radius, height, angle)?;
        finish!(maker, "BRepPrimAPI_MakeCylinder")
    });
    result.or_raise(cx)
}

#[neon::export(name = "makeCone")]
fn make_cone<'cx>(
    cx: &mut Cx<'cx>,
    frame: Vec<f64>,
    base_radius: f64,
    top_radius: f64,
    height: f64,
    angle: f64,
) -> ShapeResult {
    let result = attempt(|| {
        if base_radius < 0.0 || top_radius < 0.0 || base_radius == top_radius {
            return Err(OcctError::invalid("cone radii must be non-negative and differ"));
        }
        positive(height, "cone height")?;
        let mut maker = BRepPrimAPI_MakeCone_new_ax2_real4(
            &*ax2(&frame)?,
            base_radius,
            top_radius,
            height,
            angle,
        )?;
        finish!(maker, "BRepPrimAPI_MakeCone")
    });
    result.or_raise(cx)
}

#[neon::export(name = "makeSphere")]
fn make_sphere<'cx>(
    cx: &mut Cx<'cx>,
    frame: Vec<f64>,
    radius: f64,
    angle1: f64,
    angle2: f64,
    angle3: f64,
) -> ShapeResult {
    let result = attempt(|| {
        positive(radius, "sphere radius")?;
        let mut maker =
            BRepPrimAPI_MakeSphere_new_ax2_real4(&*ax2(&frame)?, radius, angle1, angle2, angle3)?;
        finish!(maker, "BRepPrimAPI_MakeSphere")
    });
    result.or_raise(cx)
}

#[neon::export(name = "makeTorus")]
fn make_torus<'cx>(
    cx: &mut Cx<'cx>,
    frame: Vec<f64>,
    major_radius: f64,
    minor_radius: f64,
    angle1: f64,
    angle2: f64,
    angle: f64,
) -> ShapeResult {
    let result = attempt(|| {
        positive(major_radius, "torus major radius")?;
        positive(minor_radius, "torus minor radius")?;
        let mut maker = BRepPrimAPI_MakeTorus_new_ax2_real5(
            &*ax2(&frame)?,
            major_radius,
            minor_radius,
            angle1,
            angle2,
            angle,
        )?;
        finish!(maker, "BRepPrimAPI_MakeTorus")
    });
    result.or_raise(cx)
}

#[neon::export(name = "makeWedge")]
#[allow(clippy::too_many_arguments)]
fn make_wedge<'cx>(
    cx: &mut Cx<'cx>,
    frame: Vec<f64>,
    dx: f64,
    dy: f64,
    dz: f64,
    xmin: f64,
    zmin: f64,
    xmax: f64,
    zmax: f64,
) -> ShapeResult {
    let result = attempt(|| {
        positive(dx, "wedge dx")?;
        positive(dy, "wedge dy")?;
        positive(dz, "wedge dz")?;
        let mut maker = BRepPrimAPI_MakeWedge_new_ax2_real7(
            &*ax2(&frame)?,
            dx,
            dy,
            dz,
            xmin,
            zmin,
            xmax,
            zmax,
        )?;
        finish!(maker, "BRepPrimAPI_MakeWedge")
    });
    result.or_raise(cx)
}
