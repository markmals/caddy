//! Topology traversal and compound assembly.

use cxx::UniquePtr;
use neon::prelude::*;
use opencascade_sys::{
    b_rep::{BRep_Tool, BRep_Tool_Pnt},
    top_abs::TopAbs_ShapeEnum,
    top_exp::{TopExp, TopExp_Explorer_new_shape_shapeenum2},
    top_tools::{
        TopTools_IndexedDataMapOfShapeListOfShape_find_from_index,
        TopTools_IndexedDataMapOfShapeListOfShape_find_index,
        TopTools_IndexedDataMapOfShapeListOfShape_new, TopTools_IndexedMapOfShape_add,
        TopTools_IndexedMapOfShape_extent, TopTools_IndexedMapOfShape_new,
        TopTools_ListOfShape_size, TopTools_ListOfShape_value,
    },
    topo_ds::{
        TopoDS_Builder_new, TopoDS_Compound_as_TopoDS_Shape_mut, TopoDS_Compound_new,
        TopoDS_Compound_to_TopoDS_Shape, TopoDS_Edge_shape, TopoDS_Iterator_new_shape_bool2,
        TopoDS_Shape, TopoDS_Vertex_shape,
    },
};

use crate::{
    convert::xyz,
    error::{OcctError, OcctResult, OrThrow, attempt},
    shape::{ShapeCell, ShapeResult, boxed, get, owned, shapes_from_js, shapes_to_js},
};

pub fn shape_enum(value: f64) -> OcctResult<TopAbs_ShapeEnum> {
    let repr = value as u32;
    if repr > 8 || f64::from(repr) != value {
        return Err(OcctError::invalid(format!("shape type must be 0..8, got {value}")));
    }
    Ok(TopAbs_ShapeEnum { repr })
}

/// Distinct sub-shapes of `kind` in TopExp_Explorer order. A sub-shape met several times (with
/// different orientations) keeps its first position but takes the last occurrence, matching
/// build123d's dict-based de-duplication.
pub fn sub_shapes(shape: &TopoDS_Shape, kind: TopAbs_ShapeEnum) -> OcctResult<Vec<UniquePtr<TopoDS_Shape>>> {
    let mut explorer =
        TopExp_Explorer_new_shape_shapeenum2(shape, kind, TopAbs_ShapeEnum::TopAbs_SHAPE)?;
    let mut seen = TopTools_IndexedMapOfShape_new()?;
    let mut found: Vec<UniquePtr<TopoDS_Shape>> = Vec::new();
    while explorer.More()? {
        let current = explorer.Current()?;
        let index = TopTools_IndexedMapOfShape_add(seen.pin_mut(), current)? as usize;
        let copy = owned(current);
        if index <= found.len() {
            found[index - 1] = copy;
        } else {
            found.push(copy);
        }
        explorer.pin_mut().Next()?;
    }
    debug_assert_eq!(found.len(), TopTools_IndexedMapOfShape_extent(&seen)? as usize);
    Ok(found)
}

#[neon::export(name = "subShapes")]
fn sub_shapes_export<'cx>(cx: &mut Cx<'cx>, shape: &ShapeCell, kind: f64) -> JsResult<'cx, JsArray> {
    let shapes = {
        let shape = get(shape).or_raise(cx)?;
        attempt(|| sub_shapes(&shape, shape_enum(kind)?)).or_raise(cx)?
    };
    shapes_to_js(cx, shapes)
}

/// Direct children (TopoDS_Iterator), with the parent's orientation and location applied.
#[neon::export(name = "childShapes")]
fn child_shapes<'cx>(cx: &mut Cx<'cx>, shape: &ShapeCell) -> JsResult<'cx, JsArray> {
    let shapes = {
        let shape = get(shape).or_raise(cx)?;
        attempt(|| {
            let mut iterator = TopoDS_Iterator_new_shape_bool2(&shape, true, true)?;
            let mut children = Vec::new();
            while iterator.More()? {
                children.push(owned(iterator.Value()?));
                iterator.pin_mut().Next()?;
            }
            Ok(children)
        })
        .or_raise(cx)?
    };
    shapes_to_js(cx, shapes)
}

/// Shapes of `ancestor_kind` within `root` that contain `sub_shape`.
#[neon::export(name = "ancestors")]
fn ancestors<'cx>(
    cx: &mut Cx<'cx>,
    root: &ShapeCell,
    sub_shape: &ShapeCell,
    ancestor_kind: f64,
) -> JsResult<'cx, JsArray> {
    let shapes = {
        let root = get(root).or_raise(cx)?;
        let sub_shape = get(sub_shape).or_raise(cx)?;
        attempt(|| {
            let mut map = TopTools_IndexedDataMapOfShapeListOfShape_new()?;
            TopExp::MapShapesAndAncestors(
                &root,
                sub_shape.ShapeType()?,
                shape_enum(ancestor_kind)?,
                map.pin_mut(),
            )?;
            let index = TopTools_IndexedDataMapOfShapeListOfShape_find_index(&map, &sub_shape)?;
            if index == 0 {
                return Ok(Vec::new());
            }
            let list = TopTools_IndexedDataMapOfShapeListOfShape_find_from_index(&map, index)?;
            (0..TopTools_ListOfShape_size(list)?)
                .map(|i| Ok(owned(TopTools_ListOfShape_value(list, i)?)))
                .collect::<OcctResult<Vec<_>>>()
        })
        .or_raise(cx)?
    };
    shapes_to_js(cx, shapes)
}

#[neon::export(name = "makeCompound")]
fn make_compound<'cx>(cx: &mut Cx<'cx>, shapes: Handle<'cx, JsArray>) -> ShapeResult {
    let shapes = shapes_from_js(cx, shapes)?;
    attempt(|| {
        let builder = TopoDS_Builder_new()?;
        let mut compound = TopoDS_Compound_new()?;
        builder.MakeCompound(compound.pin_mut())?;
        for shape in &shapes {
            builder.Add(TopoDS_Compound_as_TopoDS_Shape_mut(compound.pin_mut()), shape)?;
        }
        boxed(TopoDS_Compound_to_TopoDS_Shape(&compound))
    })
    .or_raise(cx)
}

/// True for degenerated edges (e.g. the collapsed seam at a sphere's pole).
#[neon::export(name = "edgeIsDegenerated")]
fn edge_is_degenerated<'cx>(cx: &mut Cx<'cx>, edge: &ShapeCell) -> NeonResult<bool> {
    let edge = get(edge).or_raise(cx)?;
    attempt(|| Ok(BRep_Tool::Degenerated(TopoDS_Edge_shape(&edge)?)?)).or_raise(cx)
}

#[neon::export(name = "vertexPoint")]
fn vertex_point<'cx>(cx: &mut Cx<'cx>, vertex: &ShapeCell) -> NeonResult<Vec<f64>> {
    let vertex = get(vertex).or_raise(cx)?;
    attempt(|| Ok(xyz(&*BRep_Tool_Pnt(TopoDS_Vertex_shape(&vertex)?)?)?.to_vec())).or_raise(cx)
}
