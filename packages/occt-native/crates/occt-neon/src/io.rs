//! BREP and IGES serialization. Callers own file IO, so every format works the same way for
//! paths, buffers and streams; `exchange` keeps the work off the JavaScript thread.

use cxx::UniquePtr;
use neon::prelude::*;
use opencascade_sys::{
    b_rep::BRep_Builder_new,
    b_rep_tools::{
        BRepTools_Read_shape_stream_builder_progressrange,
        BRepTools_Write_shape_stream_progressrange,
    },
    bin_tools::{
        BinTools_Read_shape_stream_progressrange, BinTools_Write_shape_stream_progressrange,
    },
    if_select::IFSelect_ReturnStatus,
    iges_control::{
        IGESControl_Controller, IGESControl_Reader_OneShape, IGESControl_Reader_ReadFile,
        IGESControl_Reader_new, IGESControl_Writer_Write_stream_bool,
        IGESControl_Writer_new_str_int,
    },
    occt_stream::{OcctStream_from_bytes, OcctStream_new, OcctStream_to_bytes},
    topo_ds::{TopoDS_Shape, TopoDS_Shape_new},
};

use crate::{
    builder::progress,
    error::{OcctError, OcctResult, OrThrow, code},
    exchange::{bytes_promise, detach, shape_promise},
    shape::ShapeCell,
};

/// OCCT's native BREP format: exact and lossless for a single shape. The text flavour is
/// `BRepTools`, the compact one `BinTools`.
pub fn write_brep(shape: &TopoDS_Shape, binary: bool) -> OcctResult<Vec<u8>> {
    let mut stream = OcctStream_new();
    if binary {
        BinTools_Write_shape_stream_progressrange(shape, stream.pin_mut(), &*progress()?)?;
    } else {
        BRepTools_Write_shape_stream_progressrange(shape, stream.pin_mut(), &*progress()?)?;
    }
    Ok(OcctStream_to_bytes(&stream))
}

pub fn read_brep(bytes: &[u8], binary: bool) -> OcctResult<UniquePtr<TopoDS_Shape>> {
    let mut stream = OcctStream_from_bytes(bytes);
    let mut shape = TopoDS_Shape_new()?;
    let builder = BRep_Builder_new()?;
    if binary {
        BinTools_Read_shape_stream_progressrange(shape.pin_mut(), stream.pin_mut(), &*progress()?)?;
    } else {
        BRepTools_Read_shape_stream_builder_progressrange(
            shape.pin_mut(),
            stream.pin_mut(),
            &builder,
            &*progress()?,
        )?;
    }
    if shape.IsNull()? {
        return Err(OcctError::new(code::IMPORT_FAILED, "BREP data contains no shape"));
    }
    Ok(shape)
}

/// IGES 5.3. `unit` is an IGES unit name (`MM`, `M`, `IN`, ...); `brep_mode` 0 writes faces as
/// trimmed surfaces, 1 writes BREP entities.
pub fn write_iges(shape: &TopoDS_Shape, unit: &str, brep_mode: i32) -> OcctResult<Vec<u8>> {
    IGESControl_Controller::Init()?;
    let mut writer = IGESControl_Writer_new_str_int(unit, brep_mode)?;
    if !writer.pin_mut().AddShape(shape, &*progress()?)? {
        return Err(OcctError::new(code::EXPORT_FAILED, "IGES transfer failed"));
    }
    writer.pin_mut().ComputeModel()?;
    let mut stream = OcctStream_new();
    if !IGESControl_Writer_Write_stream_bool(writer.pin_mut(), stream.pin_mut(), false)? {
        return Err(OcctError::new(code::EXPORT_FAILED, "IGES write failed"));
    }
    Ok(OcctStream_to_bytes(&stream))
}

/// Every root of an IGES file as one shape (a compound when there are several).
///
/// OCCT 8.0.1's `IGESSelect_WorkLibrary` implements `ReadFile` but not `ReadStream`, so unlike
/// every other format here IGES import has to go through a real path.
pub fn read_iges(path: &str) -> OcctResult<UniquePtr<TopoDS_Shape>> {
    IGESControl_Controller::Init()?;
    let mut reader = IGESControl_Reader_new()?;
    let status = IGESControl_Reader_ReadFile(reader.pin_mut(), path)?;
    if status != IFSelect_ReturnStatus::IFSelect_RetDone {
        return Err(OcctError::new(code::IMPORT_FAILED, format!("IGES read failed ({status:?})")));
    }
    if reader.pin_mut().TransferRoots(&*progress()?)? == 0 {
        return Err(OcctError::new(code::IMPORT_FAILED, "IGES data contains no shapes"));
    }
    Ok(IGESControl_Reader_OneShape(&reader)?)
}

#[neon::export(name = "brepWrite")]
fn brep_write<'cx>(cx: &mut Cx<'cx>, shape: &ShapeCell, binary: bool) -> JsResult<'cx, JsPromise> {
    let shape = detach(shape).or_raise(cx)?;
    bytes_promise(cx, move || write_brep(shape.get(), binary))
}

#[neon::export(name = "brepRead")]
fn brep_read<'cx>(cx: &mut Cx<'cx>, bytes: Vec<u8>, binary: bool) -> JsResult<'cx, JsPromise> {
    shape_promise(cx, move || read_brep(&bytes, binary))
}

#[neon::export(name = "igesWrite")]
fn iges_write<'cx>(
    cx: &mut Cx<'cx>,
    shape: &ShapeCell,
    unit: String,
    brep_mode: f64,
) -> JsResult<'cx, JsPromise> {
    let shape = detach(shape).or_raise(cx)?;
    bytes_promise(cx, move || write_iges(shape.get(), &unit, brep_mode as i32))
}

#[neon::export(name = "igesRead")]
fn iges_read<'cx>(cx: &mut Cx<'cx>, path: String) -> JsResult<'cx, JsPromise> {
    shape_promise(cx, move || read_iges(&path))
}
