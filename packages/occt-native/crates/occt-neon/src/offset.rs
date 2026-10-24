use neon::prelude::*;
use opencascade_sys::{
    b_rep_offset::{BRepOffset_MakeOffset_new, BRepOffset_Mode},
    b_rep_offset_api::{BRepOffsetAPI_DraftAngle_new_shape, BRepOffsetAPI_MakeThickSolid_new},
    geom_abs::GeomAbs_JoinType,
    gp::gp_Pln_new_ax3,
    topo_ds::TopoDS_Face_shape,
};

use crate::{
    builder::{finish, progress},
    convert::{ax3, dir},
    error::{OcctError, OcctResult, OrThrow, attempt},
    shape::{ShapeCell, ShapeResult, boxed, get, owned, shape_list, shapes_from_js},
};

fn join_type(kind: f64) -> OcctResult<GeomAbs_JoinType> {
    match kind {
        0.0 => Ok(GeomAbs_JoinType::GeomAbs_Arc),
        1.0 => Ok(GeomAbs_JoinType::GeomAbs_Intersection),
        _ => Err(OcctError::invalid("offset kind must be arc or intersection")),
    }
}

/// build123d `Mixin3D.offset_3d`/`hollow`: `MakeThickSolidByJoin` with an empty face list offsets
/// the whole solid, so the same call serves both an offset and a shelled solid.
#[neon::export(name = "featureOffset")]
fn feature_offset<'cx>(
    cx: &mut Cx<'cx>,
    shape: &ShapeCell,
    amount: f64,
    openings: Handle<'cx, JsArray>,
    kind: f64,
    tolerance: f64,
) -> ShapeResult {
    let openings = shapes_from_js(cx, openings)?;
    attempt(|| {
        if !amount.is_finite() || amount == 0.0 || !tolerance.is_finite() || tolerance <= 0.0 {
            return Err(OcctError::invalid(
                "offset requires a nonzero amount and positive tolerance",
            ));
        }
        let shape = get(shape)?;
        let join = join_type(kind)?;
        let mut maker = BRepOffsetAPI_MakeThickSolid_new()?;
        maker.pin_mut().MakeThickSolidByJoin(
            &shape,
            &*shape_list(&openings)?,
            amount,
            tolerance,
            BRepOffset_Mode::BRepOffset_Skin,
            true,
            false,
            join,
            true,
            &*progress()?,
        )?;
        finish!(maker, "BRepOffsetAPI_MakeThickSolid")
    })
    .or_raise(cx)
}

#[neon::export(name = "featureThicken")]
fn feature_thicken<'cx>(cx: &mut Cx<'cx>, surface: &ShapeCell, amount: f64) -> ShapeResult {
    attempt(|| {
        if !amount.is_finite() || amount == 0.0 {
            return Err(OcctError::invalid("thickness must be nonzero and finite"));
        }
        let surface = get(surface)?;
        let mut maker = BRepOffset_MakeOffset_new()?;
        maker.pin_mut().Initialize(
            &surface,
            amount,
            1e-5,
            BRepOffset_Mode::BRepOffset_Skin,
            true,
            false,
            GeomAbs_JoinType::GeomAbs_Intersection,
            true,
            true,
        )?;
        maker.pin_mut().MakeOffsetShape(&*progress()?)?;
        if !maker.IsDone()? {
            return Err(OcctError::failed("BRepOffset_MakeOffset could not thicken the surface"));
        }
        boxed(owned(maker.Shape()?))
    })
    .or_raise(cx)
}

#[neon::export(name = "featureDraft")]
fn feature_draft<'cx>(
    cx: &mut Cx<'cx>,
    solid: &ShapeCell,
    faces: Handle<'cx, JsArray>,
    frame: Vec<f64>,
    angle: f64,
) -> ShapeResult {
    let faces = shapes_from_js(cx, faces)?;
    attempt(|| {
        if faces.is_empty() || !angle.is_finite() {
            return Err(OcctError::invalid("draft requires faces and a finite angle"));
        }
        let solid = get(solid)?;
        let mut maker = BRepOffsetAPI_DraftAngle_new_shape(&solid)?;
        let plane = gp_Pln_new_ax3(&*ax3(&frame)?)?;
        let direction = dir(&frame[3..6])?;
        for face in &faces {
            maker.pin_mut().Add(TopoDS_Face_shape(face)?, &direction, angle, &plane, true)?;
            if !maker.AddDone()? {
                return Err(OcctError::failed("BRepOffsetAPI_DraftAngle could not add face"));
            }
        }
        finish!(maker, "BRepOffsetAPI_DraftAngle")
    })
    .or_raise(cx)
}
