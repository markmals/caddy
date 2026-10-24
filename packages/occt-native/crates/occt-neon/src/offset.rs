use cxx::UniquePtr;
use neon::prelude::*;
use opencascade_sys::{
    b_rep_builder_api::BRepBuilderAPI_MakeSolid_new_shell2,
    b_rep_offset::{BRepOffset_MakeOffset_new, BRepOffset_Mode},
    b_rep_offset_api::{
        BRepOffsetAPI_DraftAngle, BRepOffsetAPI_DraftAngle_new_shape,
        BRepOffsetAPI_MakeThickSolid_new,
    },
    geom_abs::GeomAbs_JoinType,
    gp::gp_Pln_new_ax3,
    top_abs::TopAbs_ShapeEnum,
    topo_ds::{TopoDS_Face_shape, TopoDS_Shape, TopoDS_Shell_shape},
};

use crate::{
    builder::{finish, progress},
    convert::{ax3, dir},
    error::{OcctError, OcctResult, OrThrow, attempt},
    shape::{ShapeCell, ShapeResult, boxed, get, into_js, owned, shape_list, shapes_from_js},
    topology::sub_shapes,
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

/// build123d `Mixin3D.hollow`: like `featureOffset` but keeping internal edges, and — when no
/// opening faces are given — rebuilding a watertight solid from the offset shell and the
/// original one so the wall, not the enlarged body, is the result.
#[neon::export(name = "featureHollow")]
fn feature_hollow<'cx>(
    cx: &mut Cx<'cx>,
    shape: &ShapeCell,
    thickness: f64,
    faces: Handle<'cx, JsArray>,
    kind: f64,
    tolerance: f64,
) -> ShapeResult {
    let faces = shapes_from_js(cx, faces)?;
    attempt(|| {
        if !thickness.is_finite() || thickness == 0.0 || !tolerance.is_finite() || tolerance <= 0.0
        {
            return Err(OcctError::invalid(
                "hollow requires a nonzero thickness and positive tolerance",
            ));
        }
        let shape = get(shape)?;
        let join = join_type(kind)?;
        let mut maker = BRepOffsetAPI_MakeThickSolid_new()?;
        maker.pin_mut().MakeThickSolidByJoin(
            &shape,
            &*shape_list(&faces)?,
            thickness,
            tolerance,
            BRepOffset_Mode::BRepOffset_Skin,
            true,
            false,
            join,
            false,
            &*progress()?,
        )?;
        maker.pin_mut().Build(&*progress()?)?;
        if !maker.IsDone()? {
            return Err(OcctError::failed("BRepOffsetAPI_MakeThickSolid failed"));
        }
        let shelled = owned(maker.pin_mut().Shape()?);
        if !faces.is_empty() {
            return boxed(shelled);
        }
        let outer = first_shell(&shelled)?;
        let inner = first_shell(&shape)?;
        let (first, second) = if thickness > 0.0 { (&outer, &inner) } else { (&inner, &outer) };
        let mut solid = BRepBuilderAPI_MakeSolid_new_shell2(
            TopoDS_Shell_shape(first)?,
            TopoDS_Shell_shape(second)?,
        )?;
        finish!(solid, "BRepBuilderAPI_MakeSolid")
    })
    .or_raise(cx)
}

fn first_shell(
    shape: &opencascade_sys::topo_ds::TopoDS_Shape,
) -> OcctResult<cxx::UniquePtr<opencascade_sys::topo_ds::TopoDS_Shape>> {
    sub_shapes(shape, TopAbs_ShapeEnum::TopAbs_SHELL)?
        .into_iter()
        .next()
        .ok_or_else(|| OcctError::failed("hollow needs a shape bounded by a shell"))
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

/// `{ shape, problematic, failedFace }`: on success only `shape` is set; otherwise `shape` is
/// null, `failedFace` indexes the face OCCT refused (-1 when the build itself failed) and
/// `problematic` is the sub-shape it blamed, if any.
#[neon::export(name = "featureDraft")]
fn feature_draft<'cx>(
    cx: &mut Cx<'cx>,
    solid: &ShapeCell,
    faces: Handle<'cx, JsArray>,
    frame: Vec<f64>,
    angle: f64,
) -> JsResult<'cx, JsObject> {
    let faces = shapes_from_js(cx, faces)?;
    let outcome = attempt(|| {
        if faces.is_empty() || !angle.is_finite() {
            return Err(OcctError::invalid("draft requires faces and a finite angle"));
        }
        let solid = get(solid)?;
        let mut maker = BRepOffsetAPI_DraftAngle_new_shape(&solid)?;
        let plane = gp_Pln_new_ax3(&*ax3(&frame)?)?;
        let direction = dir(&frame[3..6])?;
        for (index, face) in faces.iter().enumerate() {
            maker.pin_mut().Add(TopoDS_Face_shape(face)?, &direction, angle, &plane, true)?;
            if !maker.AddDone()? {
                return Ok(Draft { shape: None, blamed: blamed(&maker)?, failed: index as f64 });
            }
        }
        maker.pin_mut().Build(&*progress()?)?;
        if !maker.IsDone()? {
            return Ok(Draft { shape: None, blamed: blamed(&maker)?, failed: -1.0 });
        }
        let shape = owned(maker.pin_mut().Shape()?);
        Ok(Draft { shape: Some(shape), blamed: None, failed: -1.0 })
    })
    .or_raise(cx)?;

    let object = cx.empty_object();
    for (key, shape) in [("shape", outcome.shape), ("problematic", outcome.blamed)] {
        match shape {
            Some(shape) => {
                let value = into_js(cx, shape).or_raise(cx)?;
                object.prop(cx, key).set(value)?;
            }
            None => {
                let value = cx.null();
                object.prop(cx, key).set(value)?;
            }
        }
    }
    object.prop(cx, "failedFace").set(outcome.failed)?;
    Ok(object)
}

struct Draft {
    shape: Option<UniquePtr<TopoDS_Shape>>,
    blamed: Option<UniquePtr<TopoDS_Shape>>,
    failed: f64,
}

fn blamed(maker: &BRepOffsetAPI_DraftAngle) -> OcctResult<Option<UniquePtr<TopoDS_Shape>>> {
    let shape = maker.ProblematicShape()?;
    Ok(if shape.IsNull()? { None } else { Some(owned(shape)) })
}
