//! The record an operation keeps of what it did to its inputs' sub-shapes (BRepTools_History),
//! and the classification of a result's sub-shapes against it.
//!
//! Only vertices, edges, faces and solids are tracked; wires, shells and compounds are
//! containers and OCCT records nothing about them.

use std::cell::RefCell;
use std::pin::Pin;

use cxx::UniquePtr;
use neon::{prelude::*, types::extract::Boxed};
use opencascade_sys::{
    b_rep_builder_api::BRepBuilderAPI_MakeShape,
    b_rep_tools::{
        BRepTools_History, BRepTools_History_new, Handle_BRepTools_History,
        Handle_BRepTools_History_get, Handle_BRepTools_History_get_mut,
    },
    top_abs::TopAbs_ShapeEnum,
    top_exp::TopExp,
    top_tools::{
        TopTools_IndexedMapOfShape_extent, TopTools_IndexedMapOfShape_find_key,
        TopTools_IndexedMapOfShape_new, TopTools_ListOfShape, TopTools_ListOfShape_size,
        TopTools_ListOfShape_value, TopTools_MapOfShape, TopTools_MapOfShape_add,
        TopTools_MapOfShape_contains, TopTools_MapOfShape_new,
    },
    topo_ds::TopoDS_Shape,
};

use crate::{
    error::{OcctError, OcctResult, OrThrow, attempt},
    shape::{ShapeCell, get, into_js, owned, shapes_from_js},
};

const TRACKED_TYPES: [TopAbs_ShapeEnum; 4] = [
    TopAbs_ShapeEnum::TopAbs_VERTEX,
    TopAbs_ShapeEnum::TopAbs_EDGE,
    TopAbs_ShapeEnum::TopAbs_FACE,
    TopAbs_ShapeEnum::TopAbs_SOLID,
];

/// Set in the flags `historyClassify` returns: the operation brought this sub-shape in or made it.
const LAST: f64 = 1.0;
/// Set in the flags `historyClassify` returns: no input held this sub-shape in any form.
const NEW: f64 = 2.0;

/// An operation record owned by JavaScript.
pub struct Record(UniquePtr<Handle_BRepTools_History>);

impl Finalize for Record {}

pub type RecordCell = RefCell<Record>;
pub type RecordBox = JsBox<RecordCell>;

/// Wraps a record for return to JavaScript.
pub fn boxed_record(handle: UniquePtr<Handle_BRepTools_History>) -> Boxed<RecordCell> {
    Boxed(RefCell::new(Record(handle)))
}

/// Boxes a record as a JavaScript value.
pub fn record_into_js<'cx>(
    cx: &mut Cx<'cx>,
    handle: UniquePtr<Handle_BRepTools_History>,
) -> Handle<'cx, RecordBox> {
    let Boxed(cell) = boxed_record(handle);
    cx.boxed(cell)
}

fn with_record<T>(
    cell: &RecordCell,
    body: impl FnOnce(&BRepTools_History) -> OcctResult<T>,
) -> OcctResult<T> {
    let record =
        cell.try_borrow().map_err(|_| OcctError::invalid("operation record is already in use"))?;
    body(Handle_BRepTools_History_get(&record.0)?)
}

/// Every distinct vertex, edge, face and solid of the given shapes.
fn tracked_subshapes(
    shapes: &[UniquePtr<TopoDS_Shape>],
) -> OcctResult<Vec<UniquePtr<TopoDS_Shape>>> {
    let mut found = TopTools_IndexedMapOfShape_new()?;
    for shape in shapes {
        for kind in TRACKED_TYPES {
            TopExp::MapShapes_shape_shapeenum_indexedmapofshape(shape, kind, found.pin_mut())?;
        }
    }
    let count = TopTools_IndexedMapOfShape_extent(&found)?;
    (1..=count)
        .map(|index| Ok(owned(TopTools_IndexedMapOfShape_find_key(&found, index)?)))
        .collect()
}

/// The record read from the result's side: every sub-shape of the result that one set of inputs
/// still holds, either untouched or rebuilt. Generated sub-shapes are left out, as neither
/// `Select.LAST` nor `Select.NEW` counts a shape made from an input of another kind as descended
/// from it.
fn descendants(
    history: &BRepTools_History,
    inputs: &[UniquePtr<TopoDS_Shape>],
) -> OcctResult<UniquePtr<TopTools_MapOfShape>> {
    let mut kept = TopTools_MapOfShape_new()?;
    for sub in tracked_subshapes(inputs)? {
        TopTools_MapOfShape_add(kept.pin_mut(), &sub)?;
        let modified = history.Modified(&sub)?;
        for index in 0..TopTools_ListOfShape_size(modified)? {
            TopTools_MapOfShape_add(kept.pin_mut(), TopTools_ListOfShape_value(modified, index)?)?;
        }
    }
    Ok(kept)
}

/// `{ shape, history }`, the shape boxed as usual and the record boxed for `historyClassify`.
pub fn recorded<'cx>(
    cx: &mut Cx<'cx>,
    shape: UniquePtr<TopoDS_Shape>,
    history: UniquePtr<Handle_BRepTools_History>,
) -> JsResult<'cx, JsObject> {
    let object = cx.empty_object();
    let shape = into_js(cx, shape).or_raise(cx)?;
    object.prop(cx, "shape").set(shape)?;
    let history = record_into_js(cx, history);
    object.prop(cx, "history").set(history)?;
    Ok(object)
}

/// What an algorithm says about one sub-shape, or nothing if it will not say: several algorithms
/// raise when asked about a kind they do not track (`BRepFilletAPI_MakeFillet2d` only answers for
/// edges).
fn answers(answer: Result<&TopTools_ListOfShape, cxx::Exception>) -> Vec<UniquePtr<TopoDS_Shape>> {
    let Ok(list) = answer else { return Vec::new() };
    let Ok(size) = TopTools_ListOfShape_size(list) else { return Vec::new() };
    (0..size).filter_map(|index| TopTools_ListOfShape_value(list, index).ok().map(owned)).collect()
}

/// Collects the per-sub-shape answers of a `BRepBuilderAPI_MakeShape` into a record
/// (build123d `ShapeHistory.from_algorithm`), for the algorithms that keep none of their own.
///
/// `IsDeleted` is not consulted: several algorithms answer it for the sub-shape kinds they track
/// and guess for the rest, so a sub-shape counts as removed when it is neither still in `result`
/// nor modified into something that is.
pub fn from_algorithm(
    mut algorithm: Pin<&mut BRepBuilderAPI_MakeShape>,
    inputs: &[UniquePtr<TopoDS_Shape>],
    result: &TopoDS_Shape,
) -> OcctResult<UniquePtr<Handle_BRepTools_History>> {
    let mut handle = BRepTools_History_new()?;
    let mut present = TopTools_MapOfShape_new()?;
    for sub in tracked_subshapes(&[owned(result)])? {
        TopTools_MapOfShape_add(present.pin_mut(), &sub)?;
    }
    for sub in tracked_subshapes(inputs)? {
        let modified = answers(algorithm.as_mut().Modified(&sub));
        let generated = answers(algorithm.as_mut().Generated(&sub));
        let mut history = Handle_BRepTools_History_get_mut(handle.pin_mut())?;
        for shape in &modified {
            history.as_mut().AddModified(&sub, shape)?;
        }
        for shape in &generated {
            if BRepTools_History::IsSupportedType(shape)? {
                history.as_mut().AddGenerated(&sub, shape)?;
            }
        }
        if modified.is_empty() && !TopTools_MapOfShape_contains(&present, &sub)? {
            history.as_mut().Remove(&sub)?;
        }
    }
    Ok(handle)
}

/// An empty record: an operation that changed nothing.
#[neon::export(name = "historyEmpty")]
fn history_empty(cx: &mut Cx) -> NeonResult<Boxed<RecordCell>> {
    let handle = attempt(|| Ok(BRepTools_History_new()?)).or_raise(cx)?;
    Ok(boxed_record(handle))
}

/// Extends `target` with the operation that came after it (BRepTools_History::Merge).
#[neon::export(name = "historyMerge")]
fn history_merge(cx: &mut Cx, target: &RecordCell, later: &RecordCell) -> NeonResult<()> {
    let result = attempt(|| {
        let later = later
            .try_borrow()
            .map_err(|_| OcctError::invalid("a record cannot be merged into itself"))?;
        let mut target = target
            .try_borrow_mut()
            .map_err(|_| OcctError::invalid("a record cannot be merged into itself"))?;
        Handle_BRepTools_History_get_mut(target.0.pin_mut())?.Merge_hhistory(&later.0)?;
        Ok(())
    });
    result.or_raise(cx)
}

/// Records that `before` was rebuilt into `after`, for what an algorithm did but does not say
/// (build123d `ShapeHistory.add_modified`). Untracked kinds are ignored.
pub fn add_modified(
    handle: &mut UniquePtr<Handle_BRepTools_History>,
    before: &TopoDS_Shape,
    after: &TopoDS_Shape,
) -> OcctResult<()> {
    if BRepTools_History::IsSupportedType(before)? {
        Handle_BRepTools_History_get_mut(handle.pin_mut())?.AddModified(before, after)?;
    }
    Ok(())
}

/// `add_modified` for a record JavaScript holds.
#[neon::export(name = "historyAddModified")]
fn history_add_modified(
    cx: &mut Cx,
    record: &RecordCell,
    before: &ShapeCell,
    after: &ShapeCell,
) -> NeonResult<()> {
    let before = get(before).or_raise(cx)?;
    let after = get(after).or_raise(cx)?;
    let result = attempt(|| {
        let mut record = record
            .try_borrow_mut()
            .map_err(|_| OcctError::invalid("operation record is already in use"))?;
        add_modified(&mut record.0, &before, &after)
    });
    result.or_raise(cx)
}

/// For each candidate sub-shape of a result, flags saying whether the operation brought it in or
/// made it (`LAST`) and whether it existed in no input at all (`NEW`), given the inputs that were
/// already there (`before`) and those the operation brought in (`brought`).
#[neon::export(name = "historyClassify")]
fn history_classify<'cx>(
    cx: &mut Cx<'cx>,
    record: &RecordCell,
    before: Handle<'cx, JsArray>,
    brought: Handle<'cx, JsArray>,
    candidates: Handle<'cx, JsArray>,
) -> NeonResult<Vec<f64>> {
    let before = shapes_from_js(cx, before)?;
    let brought = shapes_from_js(cx, brought)?;
    let candidates = shapes_from_js(cx, candidates)?;
    let result = attempt(|| {
        with_record(record, |history| {
            let from_before = descendants(history, &before)?;
            let from_brought = descendants(history, &brought)?;
            let mut flags = Vec::with_capacity(candidates.len());
            for candidate in &candidates {
                let old = TopTools_MapOfShape_contains(&from_before, candidate)?;
                let new = TopTools_MapOfShape_contains(&from_brought, candidate)?;
                flags.push(match (old, new) {
                    (_, true) => LAST,
                    (true, false) => 0.0,
                    (false, false) => LAST + NEW,
                });
            }
            Ok(flags)
        })
    });
    result.or_raise(cx)
}
