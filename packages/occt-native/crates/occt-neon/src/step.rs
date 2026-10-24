//! STEP through XCAF, so names, colours and assembly structure survive the round trip.
//!
//! Port of build123d's `exporters3d.export_step` and `importers.import_step`.

use neon::prelude::*;
use opencascade_sys::{
    api_header_section::{
        APIHeaderSection_MakeHeader_new_hstepmodel, APIHeaderSection_MakeHeader_new_int,
    },
    if_select::IFSelect_ReturnStatus,
    iges_control::IGESControl_Controller,
    interface::Interface_Static_SetIVal,
    occt_stream::{OcctStream_from_bytes, OcctStream_new, OcctStream_to_bytes},
    step_control::{STEPControl_Controller, STEPControl_StepModelType, STEPControl_Writer_Model},
    stepcaf_control::{
        STEPCAFControl_Controller, STEPCAFControl_Reader_ReadStream, STEPCAFControl_Reader_new,
        STEPCAFControl_Writer_Transfer_hdocument_stepmodeltype_str_progressrange,
        STEPCAFControl_Writer_WriteStream, STEPCAFControl_Writer_new_hworksession_bool,
    },
    t_collection::TCollection_HAsciiString_new_str,
    xs_control::XSControl_WorkSession_new,
};

use crate::{
    assembly::{self, ImportedNode, Node},
    builder::progress,
    error::{OcctError, OcctResult, code},
    exchange::{bytes_promise, promise},
    marshal,
    xde::Document,
};

/// What `export_step` needs beyond the shape tree itself.
pub struct WriteOptions {
    /// Metres per model unit, as `XCAFDoc_DocumentTool::SetLengthUnit` wants it.
    pub length_unit_meters: f64,
    pub write_pcurves: bool,
    /// `write.precision.mode`: -1 least, 0 average, 1 greatest, 2 session.
    pub precision_mode: i32,
    pub originating_system: String,
    /// STEP header `FILE_NAME` name field; empty leaves OCCT's default.
    pub name: String,
    /// STEP header `FILE_NAME` timestamp; empty leaves OCCT's default.
    pub timestamp: String,
}

pub fn write(root: &Node, options: &WriteOptions) -> OcctResult<Vec<u8>> {
    let mut document = Document::new(true)?;
    document.set_length_unit(options.length_unit_meters)?;
    assembly::build(&mut document, root)?;

    STEPCAFControl_Controller::Init()?;
    STEPControl_Controller::Init()?;
    IGESControl_Controller::Init()?;
    Interface_Static_SetIVal("write.surfacecurve.mode", i32::from(options.write_pcurves))?;
    Interface_Static_SetIVal("write.precision.mode", options.precision_mode)?;

    let session = XSControl_WorkSession_new()?;
    let mut writer = STEPCAFControl_Writer_new_hworksession_bool(&session, false)?;
    writer.pin_mut().SetColorMode(true)?;
    writer.pin_mut().SetLayerMode(true)?;
    writer.pin_mut().SetNameMode(true)?;
    write_header(&mut writer, options)?;

    let transferred = STEPCAFControl_Writer_Transfer_hdocument_stepmodeltype_str_progressrange(
        writer.pin_mut(),
        document.handle(),
        STEPControl_StepModelType::STEPControl_AsIs,
        "",
        &*progress()?,
    )?;
    if !transferred {
        return Err(OcctError::new(code::EXPORT_FAILED, "STEP transfer failed"));
    }

    let mut stream = OcctStream_new();
    let status = STEPCAFControl_Writer_WriteStream(writer.pin_mut(), stream.pin_mut())?;
    if status != IFSelect_ReturnStatus::IFSelect_RetDone {
        return Err(OcctError::new(code::EXPORT_FAILED, format!("STEP write failed ({status:?})")));
    }
    Ok(OcctStream_to_bytes(&stream))
}

/// Fills the STEP `FILE_NAME` header, with build123d's fallback for the OCCT versions where a
/// header built from an untransferred model comes back incomplete.
fn write_header(
    writer: &mut cxx::UniquePtr<opencascade_sys::stepcaf_control::STEPCAFControl_Writer>,
    options: &WriteOptions,
) -> OcctResult<()> {
    let model = STEPControl_Writer_Model(writer.pin_mut().ChangeWriter()?, false)?;
    let mut header = APIHeaderSection_MakeHeader_new_hstepmodel(&model)?;
    if !header.IsDone()? {
        header = APIHeaderSection_MakeHeader_new_int(0)?;
        header.Apply(&model)?;
    }
    if !options.name.is_empty() {
        header.pin_mut().SetName(&*TCollection_HAsciiString_new_str(&options.name)?)?;
    }
    if !options.timestamp.is_empty() {
        header.pin_mut().SetTimeStamp(&*TCollection_HAsciiString_new_str(&options.timestamp)?)?;
    }
    if !options.originating_system.is_empty() {
        let system = TCollection_HAsciiString_new_str(&options.originating_system)?;
        header.pin_mut().SetOriginatingSystem(&system)?;
    }
    Ok(())
}

pub fn read(bytes: &[u8]) -> OcctResult<Vec<ImportedNode>> {
    STEPCAFControl_Controller::Init()?;
    STEPControl_Controller::Init()?;

    let mut document = Document::new(false)?;
    let mut reader = STEPCAFControl_Reader_new()?;
    reader.pin_mut().SetNameMode(true)?;
    reader.pin_mut().SetColorMode(true)?;
    reader.pin_mut().SetLayerMode(true)?;

    let mut stream = OcctStream_from_bytes(bytes);
    let status =
        STEPCAFControl_Reader_ReadStream(reader.pin_mut(), "caddy-import.step", stream.pin_mut())?;
    if status != IFSelect_ReturnStatus::IFSelect_RetDone {
        return Err(OcctError::new(code::IMPORT_FAILED, format!("STEP read failed ({status:?})")));
    }
    if !reader.pin_mut().Transfer(document.handle(), &*progress()?)? {
        return Err(OcctError::new(code::IMPORT_FAILED, "STEP data contains no shapes"));
    }
    let nodes = assembly::read(&mut document)?;
    if nodes.is_empty() {
        return Err(OcctError::new(code::IMPORT_FAILED, "STEP data contains no shapes"));
    }
    Ok(nodes)
}

#[neon::export(name = "stepWrite")]
fn step_write<'cx>(
    cx: &mut Cx<'cx>,
    root: Handle<'cx, JsObject>,
    options: Handle<'cx, JsObject>,
) -> JsResult<'cx, JsPromise> {
    let root = marshal::node(cx, root)?;
    let options = marshal::write_options(cx, options)?;
    bytes_promise(cx, move || write(&root, &options))
}

#[neon::export(name = "stepRead")]
fn step_read<'cx>(cx: &mut Cx<'cx>, bytes: Vec<u8>) -> JsResult<'cx, JsPromise> {
    promise(cx, move || read(&bytes), marshal::nodes_to_js)
}
