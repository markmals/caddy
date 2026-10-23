//! In-memory BREP and STEP serialization. Callers own file IO, so every format works the same
//! way for paths, buffers and streams.

use neon::{prelude::*, types::extract::Boxed};
use opencascade_sys::{
    b_rep::BRep_Builder_new,
    b_rep_tools::{
        BRepTools_Read_shape_stream_builder_progressrange,
        BRepTools_Write_shape_stream_progressrange,
    },
    if_select::IFSelect_ReturnStatus,
    occt_stream::{OcctStream_from_bytes, OcctStream_new, OcctStream_to_bytes},
    step_control::{
        STEPControl_Reader_OneShape, STEPControl_Reader_ReadStream, STEPControl_Reader_new,
        STEPControl_StepModelType, STEPControl_Writer_WriteStream, STEPControl_Writer_new,
    },
    topo_ds::TopoDS_Shape_new,
};

use crate::{
    builder::progress,
    error::attempt,
    error::{OcctError, OrThrow, code},
    shape::{ShapeCell, ShapeResult, boxed, get},
};

/// OCCT's native text BREP format (BRepTools::Write).
#[neon::export(name = "brepWrite")]
fn brep_write<'cx>(cx: &mut Cx<'cx>, shape: &ShapeCell) -> NeonResult<Vec<u8>> {
    let shape = get(shape).or_raise(cx)?;
    let result = attempt(|| {
        let mut stream = OcctStream_new();
        BRepTools_Write_shape_stream_progressrange(&shape, stream.pin_mut(), &*progress()?)?;
        Ok(OcctStream_to_bytes(&stream))
    });
    result.or_raise(cx)
}

#[neon::export(name = "brepRead")]
fn brep_read<'cx>(cx: &mut Cx<'cx>, bytes: Vec<u8>) -> ShapeResult {
    let result = attempt(|| {
        let mut stream = OcctStream_from_bytes(&bytes);
        let mut shape = TopoDS_Shape_new()?;
        let builder = BRep_Builder_new()?;
        BRepTools_Read_shape_stream_builder_progressrange(
            shape.pin_mut(),
            stream.pin_mut(),
            &builder,
            &*progress()?,
        )?;
        if shape.IsNull()? {
            return Err(OcctError::new(code::IMPORT_FAILED, "BREP data contains no shape"));
        }
        boxed(shape)
    });
    result.or_raise(cx)
}

/// STEP AP214 (OCCT's default schema) with the shape transferred "as is".
#[neon::export(name = "stepWrite")]
fn step_write<'cx>(cx: &mut Cx<'cx>, shape: &ShapeCell) -> NeonResult<Vec<u8>> {
    let shape = get(shape).or_raise(cx)?;
    let result = attempt(|| {
        let mut writer = STEPControl_Writer_new()?;
        let status = writer.pin_mut().Transfer(
            &shape,
            STEPControl_StepModelType::STEPControl_AsIs,
            true,
            &*progress()?,
        )?;
        if status != IFSelect_ReturnStatus::IFSelect_RetDone {
            return Err(OcctError::new(
                code::EXPORT_FAILED,
                format!("STEP transfer failed ({status:?})"),
            ));
        }
        let mut stream = OcctStream_new();
        let status = STEPControl_Writer_WriteStream(writer.pin_mut(), stream.pin_mut())?;
        if status != IFSelect_ReturnStatus::IFSelect_RetDone {
            return Err(OcctError::new(
                code::EXPORT_FAILED,
                format!("STEP write failed ({status:?})"),
            ));
        }
        Ok(OcctStream_to_bytes(&stream))
    });
    result.or_raise(cx)
}

/// Reads every root of a STEP file into one shape (a compound when there are several).
#[neon::export(name = "stepRead")]
fn step_read<'cx>(cx: &mut Cx<'cx>, bytes: Vec<u8>) -> NeonResult<Boxed<ShapeCell>> {
    let result = attempt(|| {
        let mut reader = STEPControl_Reader_new()?;
        let mut stream = OcctStream_from_bytes(&bytes);
        let status =
            STEPControl_Reader_ReadStream(reader.pin_mut(), "caddy-import.step", stream.pin_mut())?;
        if status != IFSelect_ReturnStatus::IFSelect_RetDone {
            return Err(OcctError::new(
                code::IMPORT_FAILED,
                format!("STEP read failed ({status:?})"),
            ));
        }
        if reader.pin_mut().TransferRoots(&*progress()?)? == 0 {
            return Err(OcctError::new(
                code::IMPORT_FAILED,
                "STEP data contains no transferable shapes",
            ));
        }
        boxed(STEPControl_Reader_OneShape(&reader)?)
    });
    result.or_raise(cx)
}
