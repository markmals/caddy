use neon::prelude::*;
use opencascade_sys::{
    b_rep_builder_api::BRepBuilderAPI_TransitionMode,
    b_rep_fill::BRepFill_TypeOfContact,
    b_rep_offset_api::{
        BRepOffsetAPI_MakePipeShell_new_wire, BRepOffsetAPI_ThruSections_new_bool2_real,
    },
    b_rep_prim_api::{
        BRepPrimAPI_MakePrism_new_shape_vec_bool2, BRepPrimAPI_MakeRevol_new_shape_ax1_real_bool,
    },
    loc_ope::LocOpe_DPrism_new_face_real2,
    topo_ds::{TopoDS_Face_shape, TopoDS_Vertex_shape, TopoDS_Wire_shape},
};

use crate::{
    builder::{finish, progress},
    convert::{ax1, ax2, vector},
    error::{OcctError, OrThrow, attempt},
    shape::{ShapeCell, ShapeResult, boxed, get, owned, shapes_from_js},
};

#[neon::export(name = "featureExtrude")]
fn feature_extrude<'cx>(cx: &mut Cx<'cx>, profile: &ShapeCell, direction: Vec<f64>) -> ShapeResult {
    attempt(|| {
        let profile = get(profile)?;
        let mut maker =
            BRepPrimAPI_MakePrism_new_shape_vec_bool2(&profile, &*vector(&direction)?, true, true)?;
        finish!(maker, "BRepPrimAPI_MakePrism")
    })
    .or_raise(cx)
}

#[neon::export(name = "featureExtrudeTaper")]
fn feature_extrude_taper<'cx>(
    cx: &mut Cx<'cx>,
    profile: &ShapeCell,
    height: f64,
    angle: f64,
) -> ShapeResult {
    attempt(|| {
        if !height.is_finite()
            || height <= 0.0
            || !angle.is_finite()
            || angle <= 0.0
            || angle >= std::f64::consts::FRAC_PI_2
        {
            return Err(OcctError::invalid(
                "taper requires positive height and angle below 90 degrees",
            ));
        }
        let profile = get(profile)?;
        let maker = LocOpe_DPrism_new_face_real2(
            TopoDS_Face_shape(&profile)?,
            height / angle.cos(),
            angle,
        )?;
        if !maker.IsDone()? {
            return Err(OcctError::failed("LocOpe_DPrism failed"));
        }
        boxed(owned(maker.Shape()?))
    })
    .or_raise(cx)
}

#[neon::export(name = "featureRevolve")]
fn feature_revolve<'cx>(
    cx: &mut Cx<'cx>,
    profile: &ShapeCell,
    axis: Vec<f64>,
    angle: f64,
) -> ShapeResult {
    attempt(|| {
        if !angle.is_finite() || angle == 0.0 {
            return Err(OcctError::invalid("revolution angle must be nonzero and finite"));
        }
        let profile = get(profile)?;
        let mut maker =
            BRepPrimAPI_MakeRevol_new_shape_ax1_real_bool(&profile, &*ax1(&axis)?, angle, true)?;
        finish!(maker, "BRepPrimAPI_MakeRevol")
    })
    .or_raise(cx)
}

#[neon::export(name = "featureLoft")]
fn feature_loft<'cx>(
    cx: &mut Cx<'cx>,
    sections: Handle<'cx, JsArray>,
    ruled: bool,
    solid: bool,
) -> ShapeResult {
    let sections = shapes_from_js(cx, sections)?;
    attempt(|| {
        if sections.len() < 2 {
            return Err(OcctError::invalid("loft requires at least two sections"));
        }
        let mut maker = BRepOffsetAPI_ThruSections_new_bool2_real(solid, ruled, 1e-6)?;
        for section in &sections {
            match section.ShapeType()? {
                opencascade_sys::top_abs::TopAbs_ShapeEnum::TopAbs_VERTEX => {
                    maker.pin_mut().AddVertex(TopoDS_Vertex_shape(section)?)?
                }
                opencascade_sys::top_abs::TopAbs_ShapeEnum::TopAbs_WIRE => {
                    maker.pin_mut().AddWire(TopoDS_Wire_shape(section)?)?
                }
                _ => return Err(OcctError::invalid("loft sections must be wires or vertices")),
            }
        }
        finish!(maker, "BRepOffsetAPI_ThruSections")
    })
    .or_raise(cx)
}

#[neon::export(name = "featureSweep")]
#[allow(clippy::too_many_arguments)]
fn feature_sweep<'cx>(
    cx: &mut Cx<'cx>,
    path: &ShapeCell,
    sections: Handle<'cx, JsArray>,
    solid: bool,
    frenet: bool,
    transition: f64,
    normal: Vec<f64>,
    auxiliary: Option<&ShapeCell>,
) -> ShapeResult {
    let sections = shapes_from_js(cx, sections)?;
    attempt(|| {
        if sections.is_empty() {
            return Err(OcctError::invalid("sweep requires at least one section"));
        }
        let path = get(path)?;
        let mut maker = BRepOffsetAPI_MakePipeShell_new_wire(TopoDS_Wire_shape(&path)?)?;
        if let Some(auxiliary) = auxiliary {
            let auxiliary = get(auxiliary)?;
            maker.pin_mut().SetMode_wire_bool_typeofcontact(
                TopoDS_Wire_shape(&auxiliary)?,
                true,
                BRepFill_TypeOfContact::BRepFill_NoContact,
            )?;
        } else if !normal.is_empty() {
            let frame = ax2(&normal)?;
            maker.pin_mut().SetMode_ax2(&frame)?;
        } else {
            maker.pin_mut().SetMode_bool(frenet)?;
        }
        let mode = match transition {
            0.0 => BRepBuilderAPI_TransitionMode::BRepBuilderAPI_Transformed,
            1.0 => BRepBuilderAPI_TransitionMode::BRepBuilderAPI_RightCorner,
            2.0 => BRepBuilderAPI_TransitionMode::BRepBuilderAPI_RoundCorner,
            _ => return Err(OcctError::invalid("invalid sweep transition")),
        };
        maker.pin_mut().SetTransitionMode(mode)?;
        for section in &sections {
            maker.pin_mut().Add_shape_bool2(section, false, !normal.is_empty())?;
        }
        maker.pin_mut().Build(&*progress()?)?;
        if !maker.IsDone()? {
            return Err(OcctError::failed("BRepOffsetAPI_MakePipeShell failed"));
        }
        if solid && !maker.pin_mut().MakeSolid()? {
            return Err(OcctError::failed("BRepOffsetAPI_MakePipeShell could not make a solid"));
        }
        boxed(owned(maker.pin_mut().Shape()?))
    })
    .or_raise(cx)
}
