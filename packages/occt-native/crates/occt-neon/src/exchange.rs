//! Running OCCT data exchange off the JavaScript thread.
//!
//! Importing and exporting a large assembly takes seconds, so every entry point in `io`, `step`
//! and `mesh` hands its work to Node's worker pool. Two OCCT properties constrain how that is
//! allowed to happen.
//!
//! **Shapes are not shared.** A `TopoDS_Shape` is a handle onto a `TopoDS_TShape` whose
//! sub-shape list, tolerances and cached triangulation are mutated by the very algorithms we
//! run (`BRepMesh_IncrementalMesh` attaches triangulations to the faces it meshes). The
//! reference counters are atomic in OCCT 8, so moving a handle to another thread is sound, but
//! two threads reaching the same TShape is not. `detach` therefore takes a deep copy on the
//! JavaScript thread; the worker owns geometry nothing else can see, and JavaScript stays free
//! to keep using — or dispose — the original.
//!
//! **The exchange layer is process-wide.** `Interface_Static` parameters
//! (`write.precision.mode`, `write.surfacecurve.mode`, ...), the `XSControl` controller
//! registry installed by `STEPControl_Controller::Init` and `Message::DefaultMessenger` are all
//! singletons. Two concurrent STEP writes would read each other's settings. Every call that
//! touches them runs under `EXCHANGE`, so exchange work is concurrent with JavaScript but
//! serialised against itself.

use std::sync::{Mutex, MutexGuard, PoisonError};

use cxx::UniquePtr;
use neon::prelude::*;
use opencascade_sys::{
    b_rep_builder_api::BRepBuilderAPI_Copy_new_shape_bool2, topo_ds::TopoDS_Shape,
};

use crate::{
    error::{OcctResult, OrThrow},
    shape::{ShapeCell, get, into_js, owned},
};

static EXCHANGE: Mutex<()> = Mutex::new(());

/// A shape the worker thread owns outright. See the module comment for why ownership — rather
/// than a shared handle — is what makes moving it across threads sound.
pub struct Detached(UniquePtr<TopoDS_Shape>);

// SAFETY: `detach` is the only constructor and it deep-copies, so the TShape graph behind this
// pointer is reachable from nothing else. A poisoned `EXCHANGE` guard cannot leak one either:
// the value is moved into the worker closure and dropped there.
unsafe impl Send for Detached {}

impl Detached {
    /// Takes a shape no other thread can reach: either a fresh deep copy, or one an OCCT
    /// algorithm has just built on the thread that will keep using it.
    pub fn adopt(shape: UniquePtr<TopoDS_Shape>) -> Self {
        Self(shape)
    }

    pub fn get(&self) -> &TopoDS_Shape {
        &self.0
    }

    pub fn into_inner(self) -> UniquePtr<TopoDS_Shape> {
        self.0
    }
}

/// Deep-copies `cell` (new TShapes and new geometry) for use on a worker thread.
pub fn detach(cell: &ShapeCell) -> OcctResult<Detached> {
    let shape = get(cell)?;
    let mut copy = BRepBuilderAPI_Copy_new_shape_bool2(&shape, true, false)?;
    Ok(Detached(owned(copy.pin_mut().Shape()?)))
}

/// Serialises `body` against every other user of OCCT's data-exchange singletons.
pub fn serialized<T>(body: impl FnOnce() -> OcctResult<T>) -> OcctResult<T> {
    let _guard: MutexGuard<'_, ()> = EXCHANGE.lock().unwrap_or_else(PoisonError::into_inner);
    body()
}

/// Runs `work` on the worker pool under the exchange lock and settles a promise with `settle`,
/// which runs back on the JavaScript thread.
pub fn promise<'cx, T, V>(
    cx: &mut Cx<'cx>,
    work: impl FnOnce() -> OcctResult<T> + Send + 'static,
    settle: impl for<'a> FnOnce(&mut Cx<'a>, T) -> JsResult<'a, V> + 'static,
) -> JsResult<'cx, JsPromise>
where
    T: Send + 'static,
    V: Value,
{
    Ok(cx.task(move || serialized(work)).promise(move |mut cx, outcome| {
        let value = outcome.or_raise(&mut cx)?;
        settle(&mut cx, value)
    }))
}

/// `promise` for the common case of a worker that produces one shape.
pub fn shape_promise<'cx>(
    cx: &mut Cx<'cx>,
    work: impl FnOnce() -> OcctResult<UniquePtr<TopoDS_Shape>> + Send + 'static,
) -> JsResult<'cx, JsPromise> {
    promise(
        cx,
        move || work().map(Detached::adopt),
        |cx, shape| Ok(into_js(cx, shape.into_inner()).or_raise(cx)?),
    )
}

/// `promise` for the common case of a worker that produces a byte buffer.
pub fn bytes_promise<'cx>(
    cx: &mut Cx<'cx>,
    work: impl FnOnce() -> OcctResult<Vec<u8>> + Send + 'static,
) -> JsResult<'cx, JsPromise> {
    promise(cx, work, |cx, bytes| Ok(JsUint8Array::from_slice(cx, &bytes)?))
}
