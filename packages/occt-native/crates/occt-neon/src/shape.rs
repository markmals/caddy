//! The JavaScript-owned shape handle and generic shape operations.
//!
//! A `Shape` lives in a `JsBox`; V8 finalization drops the `UniquePtr`, releasing the
//! `TopoDS_Shape` (and, once unreferenced, its TShape and geometry). `shapeDispose` releases it
//! early for callers that manage lifetimes explicitly (`using` in TypeScript).
//!
//! `TopoDS_Shape` copies share their TShape; they are cheap handle copies, not deep copies.

use std::cell::{Ref, RefCell};

use cxx::UniquePtr;
use neon::{prelude::*, types::extract::Boxed};
use opencascade_sys::{
    b_rep_builder_api::{
        BRepBuilderAPI_Copy_new_shape_bool2, BRepBuilderAPI_GTransform_new_shape_gtrsf_bool,
        BRepBuilderAPI_Transform_new_shape_trsf_bool2,
    },
    geom_abs::GeomAbs_Shape,
    shape_custom::{ShapeCustom_BSplineRestriction, ShapeCustom_RestrictionParameters_new},
    top_abs::TopAbs_Orientation,
    top_loc::TopLoc_Location_new_trsf,
    top_tools::{
        TopTools_ListOfShape, TopTools_ListOfShape_append, TopTools_ListOfShape_new,
        TopTools_ShapeMapHasher_call_shape, TopTools_ShapeMapHasher_new,
    },
    topo_ds::{
        TopoDS_Shape, TopoDS_Shape_Located, TopoDS_Shape_Moved, TopoDS_Shape_Oriented,
        TopoDS_Shape_Reversed, TopoDS_Shape_clone,
    },
};

use crate::{
    convert::{gtrsf_from, trsf_from, trsf_to_vec},
    error::attempt,
    error::{OcctError, OcctResult, OrThrow, code},
};

/// Native shape owned by a JavaScript object; `None` once disposed.
pub struct Shape(Option<UniquePtr<TopoDS_Shape>>);

impl Finalize for Shape {}

pub type ShapeCell = RefCell<Shape>;
pub type ShapeBox = JsBox<ShapeCell>;
pub type ShapeResult = NeonResult<Boxed<ShapeCell>>;

/// Wraps a shape for return to JavaScript, rejecting null results.
pub fn boxed(shape: UniquePtr<TopoDS_Shape>) -> OcctResult<Boxed<ShapeCell>> {
    if shape.is_null() || shape.IsNull()? {
        return Err(OcctError::failed("operation produced a null shape"));
    }
    Ok(Boxed(RefCell::new(Shape(Some(shape)))))
}

/// Boxes one shape as a JavaScript value, rejecting null results.
pub fn into_js<'cx>(
    cx: &mut Cx<'cx>,
    shape: UniquePtr<TopoDS_Shape>,
) -> OcctResult<Handle<'cx, ShapeBox>> {
    let Boxed(cell) = boxed(shape)?;
    Ok(cx.boxed(cell))
}

/// Takes an owned handle copy of a shape referenced by an OCCT algorithm.
pub fn owned(shape: &TopoDS_Shape) -> UniquePtr<TopoDS_Shape> {
    TopoDS_Shape_clone(shape)
}

/// Borrows the native shape, failing with `DISPOSED` after `shapeDispose`.
pub fn get(cell: &ShapeCell) -> OcctResult<Ref<'_, TopoDS_Shape>> {
    Ref::filter_map(cell.borrow(), |shape| shape.0.as_ref().and_then(|ptr| ptr.as_ref()))
        .map_err(|_| OcctError::new(code::DISPOSED, "shape has been disposed"))
}

/// Handle copies of every shape in a JavaScript array.
pub fn shapes_from_js<'cx>(
    cx: &mut Cx<'cx>,
    array: Handle<'cx, JsArray>,
) -> NeonResult<Vec<UniquePtr<TopoDS_Shape>>> {
    let values = array.to_vec(cx)?;
    let mut shapes = Vec::with_capacity(values.len());
    for value in values {
        let cell = value.downcast_or_throw::<ShapeBox, _>(cx)?;
        let shape = get(&cell).or_raise(cx)?;
        shapes.push(owned(&shape));
    }
    Ok(shapes)
}

pub fn shape_list(
    shapes: &[UniquePtr<TopoDS_Shape>],
) -> OcctResult<UniquePtr<TopTools_ListOfShape>> {
    let mut list = TopTools_ListOfShape_new()?;
    for shape in shapes {
        TopTools_ListOfShape_append(list.pin_mut(), shape)?;
    }
    Ok(list)
}

pub fn shapes_to_js<'cx>(
    cx: &mut Cx<'cx>,
    shapes: Vec<UniquePtr<TopoDS_Shape>>,
) -> JsResult<'cx, JsArray> {
    let array = cx.empty_array();
    for (index, shape) in shapes.into_iter().enumerate() {
        let value = cx.boxed(RefCell::new(Shape(Some(shape))));
        array.prop(cx, index as u32).set(value)?;
    }
    Ok(array)
}

#[neon::export(name = "shapeDispose")]
fn shape_dispose(shape: &ShapeCell) {
    shape.borrow_mut().0 = None;
}

#[neon::export(name = "shapeIsDisposed")]
fn shape_is_disposed(shape: &ShapeCell) -> bool {
    shape.borrow().0.is_none()
}

/// `TopAbs_ShapeEnum` value: COMPOUND=0, COMPSOLID=1, SOLID=2, SHELL=3, FACE=4, WIRE=5, EDGE=6, VERTEX=7.
#[neon::export(name = "shapeType")]
fn shape_type<'cx>(cx: &mut Cx<'cx>, shape: &ShapeCell) -> NeonResult<f64> {
    let shape = get(shape).or_raise(cx)?;
    let kind = shape.ShapeType().or_raise(cx)?;
    Ok(f64::from(kind.repr))
}

/// `TopAbs_Orientation` value: FORWARD=0, REVERSED=1, INTERNAL=2, EXTERNAL=3.
#[neon::export(name = "shapeOrientation")]
fn shape_orientation<'cx>(cx: &mut Cx<'cx>, shape: &ShapeCell) -> NeonResult<f64> {
    let shape = get(shape).or_raise(cx)?;
    let orientation = shape.Orientation().or_raise(cx)?;
    Ok(f64::from(orientation.repr))
}

#[neon::export(name = "shapeIsSame")]
fn shape_is_same<'cx>(cx: &mut Cx<'cx>, a: &ShapeCell, b: &ShapeCell) -> NeonResult<bool> {
    let (a, b) = (get(a).or_raise(cx)?, get(b).or_raise(cx)?);
    a.IsSame(&b).or_raise(cx)
}

#[neon::export(name = "shapeIsEqual")]
fn shape_is_equal<'cx>(cx: &mut Cx<'cx>, a: &ShapeCell, b: &ShapeCell) -> NeonResult<bool> {
    let (a, b) = (get(a).or_raise(cx)?, get(b).or_raise(cx)?);
    a.IsEqual(&b).or_raise(cx)
}

#[neon::export(name = "shapeIsPartner")]
fn shape_is_partner<'cx>(cx: &mut Cx<'cx>, a: &ShapeCell, b: &ShapeCell) -> NeonResult<bool> {
    let (a, b) = (get(a).or_raise(cx)?, get(b).or_raise(cx)?);
    a.IsPartner(&b).or_raise(cx)
}

/// Hash consistent with `shapeIsSame` (orientation-independent), truncated to 52 bits so it
/// is exact as a JavaScript number.
#[neon::export(name = "shapeHash")]
fn shape_hash<'cx>(cx: &mut Cx<'cx>, shape: &ShapeCell) -> NeonResult<f64> {
    let shape = get(shape).or_raise(cx)?;
    let hasher = TopTools_ShapeMapHasher_new().or_raise(cx)?;
    let hash = TopTools_ShapeMapHasher_call_shape(&hasher, &shape).or_raise(cx)?;
    Ok((hash & ((1usize << 52) - 1)) as f64)
}

#[neon::export(name = "shapeOriented")]
fn shape_oriented<'cx>(cx: &mut Cx<'cx>, shape: &ShapeCell, orientation: f64) -> ShapeResult {
    let shape = get(shape).or_raise(cx)?;
    let result = attempt(|| {
        let value = orientation as u32;
        if value > 3 || f64::from(value) != orientation {
            return Err(OcctError::invalid("orientation must be 0, 1, 2 or 3"));
        }
        boxed(TopoDS_Shape_Oriented(&shape, TopAbs_Orientation { repr: value })?)
    });
    result.or_raise(cx)
}

#[neon::export(name = "shapeReversed")]
fn shape_reversed<'cx>(cx: &mut Cx<'cx>, shape: &ShapeCell) -> ShapeResult {
    let shape = get(shape).or_raise(cx)?;
    let result = attempt(|| boxed(TopoDS_Shape_Reversed(&shape)?));
    result.or_raise(cx)
}

/// Deep copy (new TShapes; geometry copied when `copyGeometry`), sharing nothing with the input.
#[neon::export(name = "shapeCopy")]
fn shape_copy<'cx>(
    cx: &mut Cx<'cx>,
    shape: &ShapeCell,
    copy_geometry: bool,
    copy_mesh: bool,
) -> ShapeResult {
    let shape = get(shape).or_raise(cx)?;
    let result = attempt(|| {
        let mut copy = BRepBuilderAPI_Copy_new_shape_bool2(&shape, copy_geometry, copy_mesh)?;
        boxed(owned(copy.pin_mut().Shape()?))
    });
    result.or_raise(cx)
}

/// The shape's location as a 3x4 row-major matrix.
#[neon::export(name = "shapeLocation")]
fn shape_location<'cx>(cx: &mut Cx<'cx>, shape: &ShapeCell) -> NeonResult<Vec<f64>> {
    let shape = get(shape).or_raise(cx)?;
    let result = attempt(|| trsf_to_vec(shape.Location()?.Transformation()?));
    result.or_raise(cx)
}

/// Same TShape with `matrix` composed onto its location (OCCT `Moved`): no geometry is copied.
#[neon::export(name = "shapeMoved")]
fn shape_moved<'cx>(cx: &mut Cx<'cx>, shape: &ShapeCell, matrix: Vec<f64>) -> ShapeResult {
    let shape = get(shape).or_raise(cx)?;
    let result = attempt(|| {
        let location = TopLoc_Location_new_trsf(&*trsf_from(&matrix)?)?;
        boxed(TopoDS_Shape_Moved(&shape, &location, true)?)
    });
    result.or_raise(cx)
}

/// Same TShape with its location replaced by `matrix` (OCCT `Located`).
#[neon::export(name = "shapeLocated")]
fn shape_located<'cx>(cx: &mut Cx<'cx>, shape: &ShapeCell, matrix: Vec<f64>) -> ShapeResult {
    let shape = get(shape).or_raise(cx)?;
    let result = attempt(|| {
        let location = TopLoc_Location_new_trsf(&*trsf_from(&matrix)?)?;
        boxed(TopoDS_Shape_Located(&shape, &location, true)?)
    });
    result.or_raise(cx)
}

/// Applies `matrix` to the geometry (BRepBuilderAPI_Transform); `copy` forces new geometry.
#[neon::export(name = "shapeTransformed")]
fn shape_transformed<'cx>(
    cx: &mut Cx<'cx>,
    shape: &ShapeCell,
    matrix: Vec<f64>,
    copy: bool,
) -> ShapeResult {
    let shape = get(shape).or_raise(cx)?;
    let result = attempt(|| {
        let mut transform = BRepBuilderAPI_Transform_new_shape_trsf_bool2(
            &shape,
            &*trsf_from(&matrix)?,
            copy,
            false,
        )?;
        boxed(owned(transform.pin_mut().Shape()?))
    });
    result.or_raise(cx)
}

/// Applies a general affine matrix (non-uniform scale, shear); converts geometry to NURBS.
#[neon::export(name = "shapeGTransformed")]
fn shape_gtransformed<'cx>(
    cx: &mut Cx<'cx>,
    shape: &ShapeCell,
    matrix: Vec<f64>,
    copy: bool,
) -> ShapeResult {
    let shape = get(shape).or_raise(cx)?;
    let result = attempt(|| {
        let mut transform =
            BRepBuilderAPI_GTransform_new_shape_gtrsf_bool(&shape, &*gtrsf_from(&matrix)?, copy)?;
        boxed(owned(transform.pin_mut().Shape()?))
    });
    result.or_raise(cx)
}

/// Every curve and surface of the shape approximated by B-splines (ShapeCustom::BSplineRestriction).
#[neon::export(name = "shapeToSplines")]
fn shape_to_splines<'cx>(
    cx: &mut Cx<'cx>,
    shape: &ShapeCell,
    degree: f64,
    tolerance: f64,
    rational: bool,
) -> ShapeResult {
    let shape = get(shape).or_raise(cx)?;
    let result = attempt(|| {
        let parameters = ShapeCustom_RestrictionParameters_new()?;
        boxed(ShapeCustom_BSplineRestriction(
            &shape,
            tolerance,
            tolerance,
            degree as i32,
            1,
            GeomAbs_Shape::GeomAbs_C0,
            GeomAbs_Shape::GeomAbs_C0,
            true,
            !rational,
            &parameters,
        )?)
    });
    result.or_raise(cx)
}
