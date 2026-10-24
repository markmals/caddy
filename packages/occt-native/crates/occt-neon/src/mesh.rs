//! Tessellation, and the STL format that is nothing but tessellation.
//!
//! Port of build123d's `Shape.mesh` / `Shape.tessellate`, `exporters3d.export_stl` and
//! `importers.import_stl`.

use cxx::UniquePtr;
use neon::prelude::*;
use opencascade_sys::{
    adaptor3d::Handle_Adaptor3d_Curve_get,
    b_rep::{BRep_Builder_new, BRep_Tool_Surface_face, BRep_Tool_Triangulation},
    b_rep_builder_api::BRepBuilderAPI_Copy_new_shape_bool2,
    b_rep_mesh::{
        BRepMesh_IncrementalMesh_new_shape_real_bool_real_bool,
        Handle_BRepMesh_IncrementalMesh_get_mut,
    },
    b_rep_tools::BRepTools,
    gc_pnts::GCPnts_AbscissaPoint,
    geom::{Geom_Surface_UIso, Geom_Surface_VIso, Handle_Geom_Curve, Handle_Geom_Surface_get},
    geom_adaptor::{GeomAdaptor_Curve_new_hcurve, Handle_GeomAdaptor_Curve_to_Adaptor3d_Curve},
    gp::{gp_Pnt_Transformed, gp_Pnt_new, gp_Trsf, gp_Vec_Crossed, gp_Vec_new},
    occt_stream::{OcctStream_from_bytes, OcctStream_new, OcctStream_to_bytes},
    poly::{
        Handle_Poly_Triangulation_get, Handle_Poly_Triangulation_get_mut, Poly_Triangulation,
        Poly_Triangulation_Node, Poly_Triangulation_Normal, Poly_Triangulation_UVNode,
    },
    rw_stl::RWStl_ReadStream,
    stl_api::{StlAPI_Writer_Write_shape_stream_progressrange, StlAPI_Writer_new},
    top_abs::{TopAbs_Orientation, TopAbs_ShapeEnum},
    top_loc::TopLoc_Location_new,
    topo_ds::{
        TopoDS_Face, TopoDS_Face_as_TopoDS_Shape, TopoDS_Face_new, TopoDS_Face_shape, TopoDS_Shape,
        TopoDS_Shape_clone,
    },
};

use crate::{
    builder::progress,
    error::{OcctError, OcctResult, OrThrow, code},
    exchange::{Detached, bytes_promise, promise, shape_promise},
    shape::{ShapeCell, get, owned},
    topology::sub_shapes,
};

/// build123d's `export_stl` defaults; also what `Shape.tessellate` uses.
pub struct MeshOptions {
    pub tolerance: f64,
    pub angular_tolerance: f64,
}

/// Flat triangle soup, ready for a GPU buffer: three floats per vertex, three indices per face.
pub struct Triangles {
    pub positions: Vec<f64>,
    pub normals: Vec<f64>,
    pub indices: Vec<u32>,
}

/// Attaches a triangulation to every face, skipping shapes OCCT already meshed finely enough.
pub fn triangulate(shape: &TopoDS_Shape, options: &MeshOptions) -> OcctResult<()> {
    if BRepTools::Triangulation(shape, options.tolerance, false)? {
        return Ok(());
    }
    let mut mesh = BRepMesh_IncrementalMesh_new_shape_real_bool_real_bool(
        shape,
        options.tolerance,
        true,
        options.angular_tolerance,
        true,
    )?;
    Handle_BRepMesh_IncrementalMesh_get_mut(mesh.pin_mut())?.Perform(&*progress()?)?;
    Ok(())
}

pub fn tessellate(shape: &TopoDS_Shape, options: &MeshOptions) -> OcctResult<Triangles> {
    triangulate(shape, options)?;
    let mut result = Triangles { positions: Vec::new(), normals: Vec::new(), indices: Vec::new() };
    for face in sub_shapes(shape, TopAbs_ShapeEnum::TopAbs_FACE)? {
        append_face(&mut result, &face)?;
    }
    Ok(result)
}

fn append_face(result: &mut Triangles, face: &TopoDS_Shape) -> OcctResult<()> {
    let mut location = TopLoc_Location_new()?;
    let mut handle = BRep_Tool_Triangulation(TopoDS_Face_shape(face)?, location.pin_mut(), 0)?;
    if handle.is_null() {
        return Ok(());
    }
    if !Handle_Poly_Triangulation_get(&handle)?.HasNormals()? {
        Handle_Poly_Triangulation_get_mut(handle.pin_mut())?.ComputeNormals()?;
    }

    let mesh = Handle_Poly_Triangulation_get(&handle)?;
    let transform = location.Transformation()?;
    let reversed = face.Orientation()? == TopAbs_Orientation::TopAbs_REVERSED;
    let offset = node_offset(&result.positions)?;

    append_nodes(&mut result.positions, &mut result.normals, mesh, transform, reversed)?;
    for index in 1..=mesh.NbTriangles()? {
        let triangle = mesh.Triangle(index)?;
        let (first, second, third) = (triangle.Value(1)?, triangle.Value(2)?, triangle.Value(3)?);
        let corners = if reversed { [first, third, second] } else { [first, second, third] };
        result.indices.extend(corners.map(|corner| offset + corner as u32 - 1));
    }
    Ok(())
}

fn node_offset(positions: &[f64]) -> OcctResult<u32> {
    u32::try_from(positions.len() / 3)
        .map_err(|_| OcctError::failed("mesh has more than 2^32 vertices"))
}

/// Appends every node of `mesh` in world coordinates. Normals of a reversed face are negated,
/// so they point out of the solid the face bounds.
fn append_nodes(
    positions: &mut Vec<f64>,
    normals: &mut Vec<f64>,
    mesh: &Poly_Triangulation,
    transform: &gp_Trsf,
    reversed: bool,
) -> OcctResult<()> {
    let rotation = transform.HVectorialPart()?;
    let flip = if reversed { -1.0 } else { 1.0 };
    for index in 1..=mesh.NbNodes()? {
        let placed = gp_Pnt_Transformed(&*Poly_Triangulation_Node(mesh, index)?, transform)?;
        positions.extend([placed.X()?, placed.Y()?, placed.Z()?]);
        let normal = Poly_Triangulation_Normal(mesh, index)?;
        let (x, y, z) = (normal.X()?, normal.Y()?, normal.Z()?);
        for row in 1..=3 {
            let rotated = *rotation.Value(row, 1)? * x
                + *rotation.Value(row, 2)? * y
                + *rotation.Value(row, 3)? * z;
            normals.push(rotated * flip);
        }
    }
    Ok(())
}

pub fn write_stl(shape: &TopoDS_Shape, options: &MeshOptions, ascii: bool) -> OcctResult<Vec<u8>> {
    triangulate(shape, options)?;
    let mut writer = StlAPI_Writer_new()?;
    *writer.pin_mut().ASCIIMode()? = ascii;
    let mut stream = OcctStream_new();
    let written = StlAPI_Writer_Write_shape_stream_progressrange(
        writer.pin_mut(),
        shape,
        stream.pin_mut(),
        &*progress()?,
    )?;
    if !written {
        return Err(OcctError::new(
            code::EXPORT_FAILED,
            "STL write failed: the shape has no triangulated faces",
        ));
    }
    Ok(OcctStream_to_bytes(&stream))
}

/// A single face carrying the STL triangulation, matching build123d's `import_stl`.
pub fn read_stl(bytes: &[u8]) -> OcctResult<UniquePtr<TopoDS_Shape>> {
    let mut stream = OcctStream_from_bytes(bytes);
    let mesh = RWStl_ReadStream(stream.pin_mut(), std::f64::consts::FRAC_PI_2, &*progress()?)?;
    if mesh.is_null() || Handle_Poly_Triangulation_get(&mesh)?.NbTriangles()? == 0 {
        return Err(OcctError::new(code::IMPORT_FAILED, "STL data contains no triangles"));
    }
    let mut face = TopoDS_Face_new()?;
    BRep_Builder_new()?.MakeFace_face_htriangulation(face.pin_mut(), &mesh)?;
    Ok(TopoDS_Shape_clone(TopoDS_Face_as_TopoDS_Shape(&face)))
}

#[neon::export(name = "stlWrite")]
fn stl_write<'cx>(
    cx: &mut Cx<'cx>,
    shape: &ShapeCell,
    tolerance: f64,
    angular_tolerance: f64,
    ascii: bool,
) -> JsResult<'cx, JsPromise> {
    let shape = detach_meshed(shape).or_raise(cx)?;
    let options = MeshOptions { tolerance, angular_tolerance };
    bytes_promise(cx, move || write_stl(shape.get(), &options, ascii))
}

#[neon::export(name = "stlRead")]
fn stl_read<'cx>(cx: &mut Cx<'cx>, bytes: Vec<u8>) -> JsResult<'cx, JsPromise> {
    shape_promise(cx, move || read_stl(&bytes))
}

/// `detach` keeping the triangulation, so a shape `shapeMesh` has meshed is reused rather than
/// re-meshed — build123d's `Shape.mesh` leaves its triangulation on the shape for later calls.
fn detach_meshed(cell: &ShapeCell) -> OcctResult<Detached> {
    let shape = get(cell)?;
    let mut copy = BRepBuilderAPI_Copy_new_shape_bool2(&shape, true, true)?;
    Ok(Detached::adopt(owned(copy.pin_mut().Shape()?)))
}

#[neon::export(name = "shapeMesh")]
fn shape_mesh<'cx>(
    cx: &mut Cx<'cx>,
    shape: &ShapeCell,
    tolerance: f64,
    angular_tolerance: f64,
) -> JsResult<'cx, JsPromise> {
    let shape = detach_meshed(shape).or_raise(cx)?;
    let options = MeshOptions { tolerance, angular_tolerance };
    shape_promise(cx, move || {
        triangulate(shape.get(), &options)?;
        Ok(shape.into_inner())
    })
}

#[neon::export(name = "shapeTessellate")]
fn shape_tessellate<'cx>(
    cx: &mut Cx<'cx>,
    shape: &ShapeCell,
    tolerance: f64,
    angular_tolerance: f64,
) -> JsResult<'cx, JsPromise> {
    let shape = detach_meshed(shape).or_raise(cx)?;
    let options = MeshOptions { tolerance, angular_tolerance };
    promise(
        cx,
        move || tessellate(shape.get(), &options),
        |cx, triangles| {
            let object = cx.empty_object();
            let positions = JsFloat64Array::from_slice(cx, &triangles.positions)?;
            object.prop(cx, "positions").set(positions)?;
            let normals = JsFloat64Array::from_slice(cx, &triangles.normals)?;
            object.prop(cx, "normals").set(normals)?;
            let indices = JsUint32Array::from_slice(cx, &triangles.indices)?;
            object.prop(cx, "indices").set(indices)?;
            Ok(object)
        },
    )
}

/// build123d's `TOLERANCE`: the slack it gives `GCPnts_AbscissaPoint::Length`, and the floor
/// below which it treats a UV extent as degenerate.
const PARAMETER_TOLERANCE: f64 = 1e-6;

/// The UV box a face's triangulation nodes span.
#[derive(Clone, Copy)]
struct UvWindow {
    min: (f64, f64),
    max: (f64, f64),
}

impl UvWindow {
    /// Extents, with a degenerate one replaced by 1 so normalising cannot divide by zero.
    fn range(self) -> (f64, f64) {
        let span = |min: f64, max: f64| {
            let extent = max - min;
            if extent < PARAMETER_TOLERANCE { 1.0 } else { extent }
        };
        (span(self.min.0, self.max.0), span(self.min.1, self.max.1))
    }

    fn center(self) -> (f64, f64) {
        ((self.min.0 + self.max.0) * 0.5, (self.min.1 + self.max.1) * 0.5)
    }
}

/// How one face contributes to a UV tessellation: the slice of the mesh it owns, the UV window
/// its nodes live in, and its physical size along the two isoparametric directions.
pub struct FaceParameterisation {
    pub vertex_count: u32,
    pub triangle_count: u32,
    pub uv_origin: (f64, f64),
    pub uv_range: (f64, f64),
    pub arc_size: (f64, f64),
    pub has_uvs: bool,
    pub reversed: bool,
}

/// A tessellation that also carries the raw surface parameters of every node, split per face.
pub struct UvTriangles {
    pub mesh: Triangles,
    pub uvs: Vec<f64>,
    pub faces: Vec<FaceParameterisation>,
}

/// build123d's `Shape.tessellate_with_uvs` short of the normalisation and atlas packing it does
/// on top: those are pure arithmetic, and happen in TypeScript.
///
/// `surface_normals` swaps the triangulation's own normals for the ones evaluated on each face's
/// surface, which is what OCCT's mesh writers use when a triangulation carries none.
pub fn tessellate_with_uvs(
    shape: &TopoDS_Shape,
    options: &MeshOptions,
    surface_normals: bool,
) -> OcctResult<UvTriangles> {
    triangulate(shape, options)?;
    let mut result = UvTriangles {
        mesh: Triangles { positions: Vec::new(), normals: Vec::new(), indices: Vec::new() },
        uvs: Vec::new(),
        faces: Vec::new(),
    };
    for face in sub_shapes(shape, TopAbs_ShapeEnum::TopAbs_FACE)? {
        append_uv_face(&mut result, &face, surface_normals)?;
    }
    Ok(result)
}

fn append_uv_face(
    result: &mut UvTriangles,
    face: &TopoDS_Shape,
    surface_normals: bool,
) -> OcctResult<()> {
    let mut location = TopLoc_Location_new()?;
    let mut handle = BRep_Tool_Triangulation(TopoDS_Face_shape(face)?, location.pin_mut(), 0)?;
    if handle.is_null() {
        return Ok(());
    }
    if !Handle_Poly_Triangulation_get(&handle)?.HasNormals()? {
        Handle_Poly_Triangulation_get_mut(handle.pin_mut())?.ComputeNormals()?;
    }

    let mesh = Handle_Poly_Triangulation_get(&handle)?;
    let reversed = face.Orientation()? == TopAbs_Orientation::TopAbs_REVERSED;
    let offset = node_offset(&result.mesh.positions)?;
    let node_count = mesh.NbNodes()?;
    let triangle_count = mesh.NbTriangles()?;

    let normals_start = result.mesh.normals.len();
    let uv_start = result.uvs.len();
    let positions = &mut result.mesh.positions;
    append_nodes(positions, &mut result.mesh.normals, mesh, location.Transformation()?, reversed)?;
    let window = append_uv_nodes(&mut result.uvs, mesh, node_count)?;
    if surface_normals && window.is_some() {
        write_surface_normals(
            &mut result.mesh.normals[normals_start..],
            &result.uvs[uv_start..],
            TopoDS_Face_shape(face)?,
            reversed,
        )?;
    }

    // build123d starts a reversed face's triangle at its second corner rather than its first;
    // the winding is the one `tessellate` produces, only rotated.
    for index in 1..=triangle_count {
        let triangle = mesh.Triangle(index)?;
        let (first, second, third) = (triangle.Value(1)?, triangle.Value(2)?, triangle.Value(3)?);
        let corners = if reversed { [second, first, third] } else { [first, second, third] };
        result.mesh.indices.extend(corners.map(|corner| offset + corner as u32 - 1));
    }

    result.faces.push(FaceParameterisation {
        vertex_count: node_count as u32,
        triangle_count: triangle_count as u32,
        uv_origin: window.map_or((0.0, 0.0), |window| window.min),
        uv_range: window.map_or((1.0, 1.0), UvWindow::range),
        arc_size: match window {
            Some(window) => arc_size(TopoDS_Face_shape(face)?, window)?,
            None => (1.0, 1.0),
        },
        has_uvs: window.is_some(),
        reversed,
    });
    Ok(())
}

/// Appends the raw surface parameters of every node, or — when the triangulation carries none,
/// as one read from STL does — `(0, 0)` per node and no window.
fn append_uv_nodes(
    uvs: &mut Vec<f64>,
    mesh: &Poly_Triangulation,
    node_count: i32,
) -> OcctResult<Option<UvWindow>> {
    if node_count == 0 || !mesh.HasUVNodes()? {
        uvs.resize(uvs.len() + node_count as usize * 2, 0.0);
        return Ok(None);
    }
    let mut window = UvWindow { min: (f64::MAX, f64::MAX), max: (f64::MIN, f64::MIN) };
    for index in 1..=node_count {
        let node = Poly_Triangulation_UVNode(mesh, index)?;
        let (u, v) = (node.X()?, node.Y()?);
        uvs.extend([u, v]);
        window.min = (window.min.0.min(u), window.min.1.min(v));
        window.max = (window.max.0.max(u), window.max.1.max(v));
    }
    Ok(Some(window))
}

/// Replaces each node's normal with the one the surface itself has at that node's parameters,
/// pointing out of the solid the face bounds. A point where the surface has no normal — a cone
/// apex, a degenerate pole — keeps the triangulated one.
fn write_surface_normals(
    normals: &mut [f64],
    uvs: &[f64],
    face: &TopoDS_Face,
    reversed: bool,
) -> OcctResult<()> {
    let handle = BRep_Tool_Surface_face(face)?;
    let surface = Handle_Geom_Surface_get(&handle)?;
    let flip = if reversed { -1.0 } else { 1.0 };
    let mut point = gp_Pnt_new()?;
    let mut along_u = gp_Vec_new()?;
    let mut along_v = gp_Vec_new()?;
    for (node, slot) in normals.chunks_exact_mut(3).enumerate() {
        surface.D1(
            uvs[node * 2],
            uvs[node * 2 + 1],
            point.pin_mut(),
            along_u.pin_mut(),
            along_v.pin_mut(),
        )?;
        let normal = gp_Vec_Crossed(&along_u, &along_v)?;
        let magnitude = normal.Magnitude()?;
        if magnitude < PARAMETER_TOLERANCE {
            continue;
        }
        let scale = flip / magnitude;
        slot[0] = normal.X()? * scale;
        slot[1] = normal.Y()? * scale;
        slot[2] = normal.Z()? * scale;
    }
    Ok(())
}

/// Arc lengths of the isoparametric curves through the middle of `window`, which is how
/// build123d gives a UV island the face's real aspect ratio. A parameterisation OCCT cannot
/// evaluate falls back to the UV extents.
fn arc_size(face: &TopoDS_Face, window: UvWindow) -> OcctResult<(f64, f64)> {
    let (width, height) = iso_lengths(face, window).unwrap_or_else(|_| window.range());
    let floor = |value: f64| if value < PARAMETER_TOLERANCE { 1.0 } else { value };
    Ok((floor(width), floor(height)))
}

fn iso_lengths(face: &TopoDS_Face, window: UvWindow) -> OcctResult<(f64, f64)> {
    let surface = BRep_Tool_Surface_face(face)?;
    let surface = Handle_Geom_Surface_get(&surface)?;
    let (u_center, v_center) = window.center();
    let along_u = Geom_Surface_VIso(surface, v_center)?;
    let along_v = Geom_Surface_UIso(surface, u_center)?;
    Ok((
        iso_length(&along_u, window.min.0, window.max.0)?,
        iso_length(&along_v, window.min.1, window.max.1)?,
    ))
}

fn iso_length(curve: &Handle_Geom_Curve, first: f64, last: f64) -> OcctResult<f64> {
    let adaptor = GeomAdaptor_Curve_new_hcurve(curve)?;
    let adaptor = Handle_GeomAdaptor_Curve_to_Adaptor3d_Curve(&adaptor);
    Ok(GCPnts_AbscissaPoint::Length_curve_real3(
        Handle_Adaptor3d_Curve_get(&adaptor)?,
        first,
        last,
        PARAMETER_TOLERANCE,
    )?)
}

#[neon::export(name = "shapeTessellateUvs")]
fn shape_tessellate_uvs<'cx>(
    cx: &mut Cx<'cx>,
    shape: &ShapeCell,
    tolerance: f64,
    angular_tolerance: f64,
    surface_normals: bool,
) -> JsResult<'cx, JsPromise> {
    let shape = detach_meshed(shape).or_raise(cx)?;
    let options = MeshOptions { tolerance, angular_tolerance };
    promise(
        cx,
        move || tessellate_with_uvs(shape.get(), &options, surface_normals),
        uv_triangles_object,
    )
}

fn uv_triangles_object<'cx>(cx: &mut Cx<'cx>, result: UvTriangles) -> JsResult<'cx, JsObject> {
    let mut vertex_counts = Vec::with_capacity(result.faces.len());
    let mut triangle_counts = Vec::with_capacity(result.faces.len());
    let mut origins = Vec::with_capacity(result.faces.len() * 2);
    let mut ranges = Vec::with_capacity(result.faces.len() * 2);
    let mut arcs = Vec::with_capacity(result.faces.len() * 2);
    let mut flags = Vec::with_capacity(result.faces.len());
    for face in &result.faces {
        vertex_counts.push(face.vertex_count);
        triangle_counts.push(face.triangle_count);
        origins.extend([face.uv_origin.0, face.uv_origin.1]);
        ranges.extend([face.uv_range.0, face.uv_range.1]);
        arcs.extend([face.arc_size.0, face.arc_size.1]);
        flags.push(u8::from(face.reversed) | (u8::from(face.has_uvs) << 1));
    }

    let object = cx.empty_object();
    for (key, values) in [
        ("positions", &result.mesh.positions),
        ("normals", &result.mesh.normals),
        ("uvs", &result.uvs),
        ("faceUvOrigins", &origins),
        ("faceUvRanges", &ranges),
        ("faceArcSizes", &arcs),
    ] {
        let array = JsFloat64Array::from_slice(cx, values)?;
        object.prop(cx, key).set(array)?;
    }
    for (key, values) in [
        ("indices", &result.mesh.indices),
        ("faceVertexCounts", &vertex_counts),
        ("faceTriangleCounts", &triangle_counts),
    ] {
        let array = JsUint32Array::from_slice(cx, values)?;
        object.prop(cx, key).set(array)?;
    }
    let array = JsUint8Array::from_slice(cx, &flags)?;
    object.prop(cx, "faceFlags").set(array)?;
    Ok(object)
}
