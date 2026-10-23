//! Mass properties, bounding boxes and validity checks.

use neon::prelude::*;
use opencascade_sys::{
    b_rep_bnd_lib::BRepBndLib,
    b_rep_check::BRepCheck_Analyzer_new_shape_bool3,
    b_rep_g_prop::BRepGProp,
    b_rep_tools::BRepTools,
    bnd::Bnd_Box_new,
    g_prop::{GProp_GProps_CentreOfMass, GProp_GProps_MatrixOfInertia, GProp_GProps_new},
};

use crate::{
    convert::xyz,
    error::attempt,
    error::{OcctError, OrThrow},
    shape::{ShapeCell, get},
};

/// `[mass, cx, cy, cz, I11, I12, I13, I21, ..., I33]` for linear ("linear"), surface
/// ("surface") or volume ("volume") properties, with OCCT's default integration settings.
#[neon::export(name = "massProperties")]
fn mass_properties<'cx>(cx: &mut Cx<'cx>, shape: &ShapeCell, kind: String) -> NeonResult<Vec<f64>> {
    let shape = get(shape).or_raise(cx)?;
    let result = attempt(|| {
        let mut props = GProp_GProps_new()?;
        match kind.as_str() {
            "linear" => BRepGProp::LinearProperties(&shape, props.pin_mut(), false, false)?,
            "surface" => BRepGProp::SurfaceProperties_shape_gprops_bool2(
                &shape,
                props.pin_mut(),
                false,
                false,
            )?,
            "volume" => BRepGProp::VolumeProperties_shape_gprops_bool3(
                &shape,
                props.pin_mut(),
                false,
                false,
                false,
            )?,
            other => return Err(OcctError::invalid(format!("unknown property kind `{other}`"))),
        }
        let mut values = vec![props.Mass()?];
        values.extend(xyz(&*GProp_GProps_CentreOfMass(&props)?)?);
        let inertia = GProp_GProps_MatrixOfInertia(&props)?;
        for row in 1..=3 {
            for col in 1..=3 {
                values.push(*inertia.Value(row, col)?);
            }
        }
        Ok(values)
    });
    result.or_raise(cx)
}

/// Axis-aligned bounds `[xmin, ymin, zmin, xmax, ymax, zmax]`, or empty for a void box.
///
/// Matches build123d: any stored triangulation is removed first (it would otherwise widen
/// the box), then `optimal` selects BRepBndLib::AddOptimal over the faster BRepBndLib::Add.
#[neon::export(name = "boundingBox")]
fn bounding_box<'cx>(cx: &mut Cx<'cx>, shape: &ShapeCell, optimal: bool) -> NeonResult<Vec<f64>> {
    let shape = get(shape).or_raise(cx)?;
    let result = attempt(|| {
        BRepTools::Clean(&shape, false)?;
        let mut bounds = Bnd_Box_new()?;
        if optimal {
            BRepBndLib::AddOptimal(&shape, bounds.pin_mut(), true, false)?;
        } else {
            BRepBndLib::Add(&shape, bounds.pin_mut(), true)?;
        }
        if bounds.IsVoid()? {
            return Ok(Vec::new());
        }
        Ok(vec![
            bounds.GetXMin()?,
            bounds.GetYMin()?,
            bounds.GetZMin()?,
            bounds.GetXMax()?,
            bounds.GetYMax()?,
            bounds.GetZMax()?,
        ])
    });
    result.or_raise(cx)
}

/// BRepCheck_Analyzer with geometric controls, run in parallel as build123d does.
#[neon::export(name = "isValid")]
fn is_valid<'cx>(cx: &mut Cx<'cx>, shape: &ShapeCell) -> NeonResult<bool> {
    let shape = get(shape).or_raise(cx)?;
    let result =
        attempt(|| Ok(BRepCheck_Analyzer_new_shape_bool3(&shape, true, true, false)?.IsValid()?));
    result.or_raise(cx)
}
