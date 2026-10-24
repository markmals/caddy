use cxx::UniquePtr;
use neon::prelude::*;
use opencascade_sys::{
    b_rep_builder_api::{
        BRepBuilderAPI_MakeSolid_new_shell, BRepBuilderAPI_Sewing_new_real_bool4,
        BRepBuilderAPI_TransitionMode, Handle_BRepBuilderAPI_Sewing_get,
        Handle_BRepBuilderAPI_Sewing_get_mut,
    },
    b_rep_feat::{
        BRepFeat_MakeDPrism_new_shape_face2_real_int_bool, BRepFeat_SplitShape_new_shape,
    },
    b_rep_fill::BRepFill_TypeOfContact,
    b_rep_offset_api::{
        BRepOffsetAPI_MakePipeShell_new_wire, BRepOffsetAPI_ThruSections_new_bool2_real,
    },
    b_rep_prim_api::{
        BRepPrimAPI_MakePrism_new_shape_vec_bool2, BRepPrimAPI_MakeRevol_new_shape_ax1_real_bool,
    },
    loc_ope::LocOpe_DPrism_new_face_real2,
    top_tools::{
        TopTools_ListOfShape, TopTools_ListOfShape_size, TopTools_ListOfShape_value,
        TopTools_SequenceOfShape_append, TopTools_SequenceOfShape_new,
    },
    topo_ds::{
        TopoDS_Face_new, TopoDS_Face_shape, TopoDS_Shape, TopoDS_Shell_shape, TopoDS_Vertex_shape,
        TopoDS_Wire_shape,
    },
};

use crate::{
    builder::{finish, progress},
    convert::{ax1, ax2, vector},
    error::{OcctError, OcctResult, OrThrow, attempt},
    shape::{ShapeCell, ShapeResult, boxed, get, owned, shapes_from_js, shapes_to_js},
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

/// build123d `Mixin3D.dprism`: a tapered prism grown from `profile` on `base`, fused when
/// `additive`. `basis` is the sketch face the profile lies on, `upTo` a face to stop at; with
/// neither an `upTo` face nor `thruAll` the prism is `depth` long.
#[neon::export(name = "featureDPrism")]
#[allow(clippy::too_many_arguments)]
fn feature_dprism<'cx>(
    cx: &mut Cx<'cx>,
    base: &ShapeCell,
    profile: &ShapeCell,
    basis: Option<&ShapeCell>,
    up_to: Option<&ShapeCell>,
    taper: f64,
    additive: bool,
    depth: f64,
    thru_all: bool,
) -> ShapeResult {
    attempt(|| {
        if !taper.is_finite() || (!thru_all && up_to.is_none() && !depth.is_finite()) {
            return Err(OcctError::invalid("dprism requires a finite taper and depth"));
        }
        let base = get(base)?;
        let profile = get(profile)?;
        let sketch = match basis {
            Some(basis) => Some(get(basis)?),
            None => None,
        };
        let empty = TopoDS_Face_new()?;
        let sketch_face = match &sketch {
            Some(shape) => TopoDS_Face_shape(shape)?,
            None => &empty,
        };
        let mut maker = BRepFeat_MakeDPrism_new_shape_face2_real_int_bool(
            &base,
            TopoDS_Face_shape(&profile)?,
            sketch_face,
            taper,
            i32::from(additive),
            false,
        )?;
        match up_to {
            Some(up_to) => {
                let up_to = get(up_to)?;
                maker.pin_mut().Perform_shape(&up_to)?;
            }
            None if thru_all => maker.pin_mut().PerformThruAll()?,
            None => maker.pin_mut().Perform_real(depth)?,
        }
        if !maker.IsDone()? {
            return Err(OcctError::failed("BRepFeat_MakeDPrism failed"));
        }
        boxed(owned(maker.pin_mut().Shape()?))
    })
    .or_raise(cx)
}

/// Sews `faces` into a shell and closes it into a solid (build123d `Solid(Shell(faces))`).
#[neon::export(name = "featureSewSolid")]
fn feature_sew_solid<'cx>(
    cx: &mut Cx<'cx>,
    faces: Handle<'cx, JsArray>,
    tolerance: f64,
) -> ShapeResult {
    let faces = shapes_from_js(cx, faces)?;
    attempt(|| {
        if faces.is_empty() {
            return Err(OcctError::invalid("a solid needs at least one face"));
        }
        let sewn = sew(&faces, tolerance)?;
        let mut maker = BRepBuilderAPI_MakeSolid_new_shell(TopoDS_Shell_shape(&sewn)?)?;
        finish!(maker, "BRepBuilderAPI_MakeSolid")
    })
    .or_raise(cx)
}

/// Joins `faces` along their shared edges (`BRepBuilderAPI_Sewing`); the result is a shell when
/// the faces meet cleanly and a compound otherwise.
#[neon::export(name = "featureSew")]
fn feature_sew<'cx>(cx: &mut Cx<'cx>, faces: Handle<'cx, JsArray>, tolerance: f64) -> ShapeResult {
    let faces = shapes_from_js(cx, faces)?;
    attempt(|| {
        if faces.is_empty() {
            return Err(OcctError::invalid("sewing needs at least one face"));
        }
        boxed(sew(&faces, tolerance)?)
    })
    .or_raise(cx)
}

/// build123d `Mixin2D.split_by_perimeter`: cuts `shape`'s faces along `edges`, returning the two
/// sides `BRepFeat_SplitShape` separates them into.
#[neon::export(name = "featureSplitByPerimeter")]
fn feature_split_by_perimeter<'cx>(
    cx: &mut Cx<'cx>,
    shape: &ShapeCell,
    edges: Handle<'cx, JsArray>,
) -> JsResult<'cx, JsObject> {
    let edges = shapes_from_js(cx, edges)?;
    let (left, right) = attempt(|| {
        if edges.is_empty() {
            return Err(OcctError::invalid("splitting needs at least one perimeter edge"));
        }
        let shape = get(shape)?;
        let mut perimeter = TopTools_SequenceOfShape_new()?;
        for edge in &edges {
            TopTools_SequenceOfShape_append(perimeter.pin_mut(), edge)?;
        }
        let mut splitter = BRepFeat_SplitShape_new_shape(&shape)?;
        if !splitter.pin_mut().Add_sequenceofshape(&perimeter)? {
            return Err(OcctError::failed("BRepFeat_SplitShape rejected the perimeter"));
        }
        splitter.pin_mut().Build(&*progress()?)?;
        if !splitter.IsDone()? {
            return Err(OcctError::failed("BRepFeat_SplitShape failed"));
        }
        Ok((shape_vec(splitter.Left()?)?, shape_vec(splitter.Right()?)?))
    })
    .or_raise(cx)?;

    let object = cx.empty_object();
    let left = shapes_to_js(cx, left)?;
    object.prop(cx, "left").set(left)?;
    let right = shapes_to_js(cx, right)?;
    object.prop(cx, "right").set(right)?;
    Ok(object)
}

fn sew(faces: &[UniquePtr<TopoDS_Shape>], tolerance: f64) -> OcctResult<UniquePtr<TopoDS_Shape>> {
    if !tolerance.is_finite() || tolerance <= 0.0 {
        return Err(OcctError::invalid("sewing needs a positive tolerance"));
    }
    let mut sewing = BRepBuilderAPI_Sewing_new_real_bool4(tolerance, true, true, true, false)?;
    for face in faces {
        Handle_BRepBuilderAPI_Sewing_get_mut(sewing.pin_mut())?.Add(face)?;
    }
    Handle_BRepBuilderAPI_Sewing_get_mut(sewing.pin_mut())?.Perform(&*progress()?)?;
    Ok(owned(Handle_BRepBuilderAPI_Sewing_get(&sewing)?.SewedShape()?))
}

fn shape_vec(list: &TopTools_ListOfShape) -> OcctResult<Vec<UniquePtr<TopoDS_Shape>>> {
    let mut shapes = Vec::new();
    for index in 0..TopTools_ListOfShape_size(list)? {
        let shape = TopTools_ListOfShape_value(list, index)?;
        if !shape.IsNull()? {
            shapes.push(owned(shape));
        }
    }
    Ok(shapes)
}
