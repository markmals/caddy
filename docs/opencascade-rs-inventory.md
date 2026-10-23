# opencascade-rs Capability Inventory

Audit of the `opencascade-rs` clone at `/tmp/caddy-research/opencascade-rs` (HEAD `32758df2`) as a candidate foundation for `@roonieone/occt-native`, cross-checked against the OCCT 8.0.1 source tree at `/tmp/caddy-research/occt/OCCT-8_0_1` and against the OCCT surface that build123d 0.13.0 actually calls (`/tmp/caddy-research/build123d-v0.13.0/src/build123d`).

All file:line references in this document are relative to the clone root `/tmp/caddy-research/opencascade-rs` unless the path begins with `OCCT-8_0_1/` (then it is relative to `/tmp/caddy-research/occt/OCCT-8_0_1`) or `packages/` (then it is relative to the Caddy repo root).

Statements marked `[INFERENCE]` were not verified by reading code or running a build.

## 1. Shape of the codebase

Three crates matter here.

| Crate | Role | Manifest |
| --- | --- | --- |
| `occt-sys` | Builds OCCT **7.8.1** from a git submodule as **static** libs via CMake. Exposes `occt_path()` and `build_occt()`. | `crates/occt-sys/Cargo.toml` |
| `opencascade-sys` | 41 `#[cxx::bridge]` modules, one per OCCT package, plus 41 hand-written C++ wrapper headers under `include/`. | `crates/opencascade-sys/Cargo.toml` |
| `opencascade` | Ergonomic Rust API (`Shape`, `Face`, `Wire`, `Edge`, `Solid`, `Workplane`, …) built on `opencascade-sys`. | `crates/opencascade/Cargo.toml` |

Conventions that recur in every category below:

- Each bridge file is `pub use inner::*; #[cxx::bridge] mod inner { unsafe extern "C++" { … } }`, so the Rust path for a type is `opencascade_sys::<module>::<Type>` (e.g. `opencascade_sys::topo_ds::TopoDS_Shape`). There is no aggregated `ffi` module; the high-level crate does `use opencascade_sys as ffi;` (`crates/opencascade/src/primitives/shape.rs:11`).
- Constructors go through one variadic C++ template, `construct_unique<T>(Args...)` (`crates/opencascade-sys/include/bindings_common.hxx:7`), renamed per call site with `#[cxx_name = "construct_unique"]`.
- Upcasts to `TopoDS_Shape` go through `upcast_ref<T, U>` / `upcast<T, U>` (`include/bindings_common.hxx:11-12`).
- `NCollection_List<T>` → `std::vector<T>` conversion is `list_to_vector` (`include/bindings_common.hxx:15`), exposed once as `shape_list_to_vector` (`src/topo_ds.rs:112`).
- Only two bridge functions return `Result`, both from `handle_try_deref` (`include/bindings_common.hxx:21`): `poly.rs:19` and `top_tools.rs:72`. Everything else is infallible from cxx's point of view. See risk note (a).

---

## 2. Capability inventory

Status legend: **direct** = usable as-is from the high-level crate; **partial** = reachable but incomplete/awkward or sys-only; **missing** = not wrapped at all; **needs lower-level binding** = present in `opencascade-sys` but with no high-level wrapper, so Caddy must write its own call path.

### 2.1 Primitive creation

| Capability | `opencascade-sys` | `opencascade` (high level) | Status |
| --- | --- | --- | --- |
| Box | `BRepPrimAPI_MakeBox` + `_new(gp_Pnt, dx, dy, dz)` — `src/b_rep_prim_api.rs:50-60` | `Shape::box_from_corners`, `box_centered`, `box_with_dimensions`, `cube`, `cube_centered` — `primitives/shape.rs:347,361,373,381,386` | direct |
| Cylinder | `BRepPrimAPI_MakeCylinder_new(gp_Ax2, r, h)` — `b_rep_prim_api.rs:39-48` | `Shape::cylinder`, `cylinder_radius_height`, `cylinder_from_points`, `cylinder_centered` — `shape.rs:392,402,408,415` | direct |
| Sphere | `BRepPrimAPI_MakeSphere_new(gp_Ax2, r, angle1)` — `b_rep_prim_api.rs:62-71` | `Shape::sphere()` → `SphereBuilder` — `shape.rs:142-166,420` | partial — only the 1-angle ctor is bound; no `(r, a1, a2, a3)` spherical-wedge overload |
| Cone | `BRepPrimAPI_MakeCone_new(gp_Ax2, r1, r2, h, angle)` — `b_rep_prim_api.rs:73-84` | `Shape::cone()` → `ConeBuilder` — `shape.rs:168-213,424` | direct |
| Torus | `BRepPrimAPI_MakeTorus_new(gp_Ax2, r1, r2, a1, a2, a3)` — `b_rep_prim_api.rs:86-98` | `Shape::torus()` → `TorusBuilder` — `shape.rs:216-274,434` | direct |
| Wedge | — | — | missing (`BRepPrimAPI_MakeWedge` not in `include/b_rep_prim_api.hxx:1-8`); build123d uses it (`topology/three_d.py`) |
| Half-space | — | — | missing (`BRepPrimAPI_MakeHalfSpace`); build123d uses it |
| Vertex | `BRepBuilderAPI_MakeVertex_gp_Pnt` — `b_rep_builder_api.rs:24-29` | `Vertex::new` — `primitives/vertex.rs:27` | direct |
| Empty/null shape | `TopoDS_Compound_new` + `BRep_Builder::MakeCompound` | `Shape::empty()` — `shape.rs:330` (deliberately an empty compound, not a null shape) | direct |
| Shape from `Poly_Triangulation` | `BRepBuilderAPI_MakeShapeOnMesh_new` — `b_rep_builder_api.rs:105-115` | none | needs lower-level binding |

### 2.2 Geometric transformations

| Capability | `opencascade-sys` | `opencascade` | Status |
| --- | --- | --- | --- |
| Rigid transform application | `BRepBuilderAPI_Transform_new(shape, gp_Trsf, copy)` — `b_rep_builder_api.rs:117-126` | `Shape::with_transform` helpers → `translated`, `rotated`, `scaled`, `mirrored` — `shape.rs:837,846,855,864` | direct |
| Affine (non-uniform) transform | `BRepBuilderAPI_GTransform_new(shape, gp_GTrsf, copy)` — `b_rep_builder_api.rs:128-137`; `gp_GTrsf` with `SetValue`/`Value` only — `src/gp.rs:89-93` | **none** | needs lower-level binding — `gp_GTrsf` has no `SetAffinity`/`SetVectorialPart`/`SetTranslationPart` binding, so a non-uniform scale must be built cell-by-cell via `SetValue` |
| Translation | `gp_Trsf::SetTranslation(gp_Pnt,gp_Pnt)` — `gp.rs:84`; `SetTranslationPart(gp_Vec)` as `set_translation_vec` — `gp.rs:86-87` | `Shape::translated` `shape.rs:837`; `Wire::translate` `wire.rs:232` | direct |
| Rotation | `gp_Trsf::SetRotation(gp_Ax1, angle)` — `gp.rs:82` | `Shape::rotated` `shape.rs:846`; `Wire::transform` `wire.rs:237` | partial — no quaternion / `gp_EulerSequence` path; build123d leans on `gp_Quaternion` and `gp_EulerSequence` heavily (27 + 7 references) |
| Uniform scale | `gp_Trsf::SetScale(gp_Pnt, factor)` — `gp.rs:83` | `Shape::scaled` — `shape.rs:855` | direct |
| Non-uniform scale | — | — | missing (needs `gp_GTrsf` + `BRepBuilderAPI_GTransform` wiring) |
| Mirror about axis | `gp_Trsf::SetMirror(gp_Ax1)` as `set_mirror_axis` — `gp.rs:80-81` | `Shape::mirrored` `shape.rs:864`; `Wire::mirror_along_axis` `wire.rs:133` | partial — only the `gp_Ax1` overload; mirror about a **plane** (`gp_Ax2`) and about a **point** (`gp_Pnt`) are unbound, and plane mirroring is the common CAD case |
| In-place location change | `TopoDS_Shape::Move` as `translate` and `::Location` as `set_global_translation` — `topo_ds.rs:76,82` | `Shape::set_global_translation` — `shape.rs:760` | direct |
| Read/compose `gp_Trsf` | `Value(row,col)` — `gp.rs:85` | — | partial — no `Multiplied`/`Inverted`/`SetValues` binding, so composing transforms must be done in Rust/`glam` and re-fed cell-wise |
| `TopLoc_Location` | `Location_new`, `Location_from_transform`, `TopLoc_Location_Transformation` — `src/top_loc.rs:11-15` | used internally by `mesh.rs` | direct (sys level) |

### 2.3 Boolean operations

| Capability | `opencascade-sys` | `opencascade` | Status |
| --- | --- | --- | --- |
| Fuse (union) | `BRepAlgoAPI_Fuse_new` — `b_rep_algo_api.rs:16-26` | `Shape::union` `shape.rs:692`; `Solid::union` `solid.rs:84`; `Face::union` `face.rs:336`; `CompoundFace::union` `face.rs:480` | direct |
| Cut (difference) | `BRepAlgoAPI_Cut_new` — `b_rep_algo_api.rs:28-41` | `Shape::subtract` `shape.rs:534`; `Solid::subtract` `solid.rs:62`; `Face::subtract` `face.rs:364` | direct |
| Common (intersection) | `BRepAlgoAPI_Common_new` — `b_rep_algo_api.rs:43-52` | `Shape::intersect` `shape.rs:710`; `Solid::intersect` `solid.rs:105` | direct |
| Section (surface×surface → edges) | `BRepAlgoAPI_Section_new` + `SectionEdges` — `b_rep_algo_api.rs:54-63` | `section::Section` / `section::edges` — `src/section.rs:6-33` | direct |
| New edges produced by a boolean | `SectionEdges()` on all four — `b_rep_algo_api.rs:14,25,41,52,63` | `BooleanShape { shape, new_edges }` — `primitives/boolean_shape.rs:6-9` | direct (this is the crate's nicest feature: `fillet_new_edges` / `chamfer_new_edges`) |
| Glue option | `SetGlue(BOPAlgo_GlueEnum)` on `Fuse` only — `b_rep_algo_api.rs:26` | none | partial |
| History (`Generated`) | `Generated` on `Cut` only — `b_rep_algo_api.rs:37-40` | none | partial — `Modified`, `IsDeleted`, and `BRepTools_History` are all unbound; build123d uses `BRepTools_History` in 10 places |
| N-ary booleans (`SetArguments`/`SetTools`) | — | — | missing; only the 2-shape ctors are bound |
| **Splitter** | — | — | missing — `BRepAlgoAPI_Splitter` (8 refs) and `BOPAlgo_Splitter` (2 refs) are core build123d operations (`Shape.split`) |
| Fuzzy boolean tolerance (`SetFuzzyValue`) | — | — | missing |
| Parallel/`SetRunParallel` | — | — | missing |

### 2.4 Topology traversal

| Capability | `opencascade-sys` | `opencascade` | Status |
| --- | --- | --- | --- |
| Explorer | `TopExp_Explorer_new(shape, TopAbs_ShapeEnum)`, `More`, `Next`, `Current`, `ExplorerCurrentShape` — `src/top_exp.rs:17-26` | `EdgeIterator` / `FaceIterator` only — `primitives.rs:114-136,148-210`; entry points `Shape::edges`/`Shape::faces` (`shape.rs:779,787`), `Face::edges` (`face.rs:269`) | partial — no vertex/wire/shell/solid/compound iterators, and the explorer's `TopAbs` "avoid" argument is not bound |
| Downcast helpers | `TopoDS::{Vertex,Edge,Wire,Face,Shell,Solid,Compound}` — `topo_ds.rs:13-27` | `Shape::as_wire/as_face/as_solid` + `expect_*` — `shape.rs:279-321` | partial — no `as_shell`, `as_compound`, `as_edge`, `as_vertex`, `as_compsolid` |
| Upcast to shape | `cast_*_to_shape` — `topo_ds.rs:31,37,43,49,58,68,94` | `From<T> for Shape` impls — `shape.rs:24-135` | direct |
| Shape type / orientation | `ShapeType()`, `Orientation()` — `topo_ds.rs:89-90,54` | `ShapeType` enum `primitives.rs:27-78`; `FaceOrientation` `face.rs:537-556` | direct |
| Identity / equality | `IsNull`, `IsEqual` — `topo_ds.rs:87-88` | none exposed | needs lower-level binding — no `IsSame`, no `HashCode`/`std::hash`, so a Rust-side shape set/map keyed on TShape identity is impossible today |
| Indexed maps | `TopTools_IndexedMapOfShape` (`Extent`, `FindKey`) — `src/top_tools.rs:26-30` | used only inside `Face::fillet`/`Face::chamfer` | needs lower-level binding |
| Ancestor maps | `TopExp::MapShapes`, `MapShapesAndAncestors`, `MapShapesAndUniqueAncestors` — `top_exp.rs:53-73`; `TopTools_IndexedDataMapOfShapeListOfShape` — `top_tools.rs:32-52` | used only inside `Face::chamfer` (`face.rs:195-215`) | needs lower-level binding |
| Edge/wire endpoints | `TopExp::Vertices` (edge and wire overloads), `TopExp_FirstVertex`, `TopExp_LastVertex`, `TopExp::CommonVertex` — `top_exp.rs:31-52` | `Edge::start_point`/`end_point` use `BRepAdaptor_Curve` parameters instead — `edge.rs:147,155` | partial |
| Build compounds/shells | `TopoDS_Builder::{MakeCompound, MakeShell, Add}` — `topo_ds.rs:104-107` | `Compound::from_shapes` — `compound.rs:29` | partial — `MakeShell` is bound but unused; no `MakeSolid`/`MakeWire`/`Remove` |
| Ordered wire traversal | — | — | missing — `BRepTools_WireExplorer` is not wrapped; build123d uses it in 6 places (`Wire.order_edges`) |
| List→vector | `shape_list_to_vector` — `topo_ds.rs:112` | used in boolean/section paths | direct |

### 2.5 Curves and wires

| Capability | `opencascade-sys` | `opencascade` | Status |
| --- | --- | --- | --- |
| Line segment edge | `BRepBuilderAPI_MakeEdge_gp_Pnt_gp_Pnt` — `b_rep_builder_api.rs:41-45`; `GC_MakeSegment` — `src/gc.rs:13-16` | `Edge::segment` — `edge.rs:62` | direct |
| Circle edge | `BRepBuilderAPI_MakeEdge_circle(gp_Circ)` — `b_rep_builder_api.rs:37-40`; `gp_Circ_new` — `gp.rs:45-47` | `Edge::circle` — `edge.rs:89` | direct |
| 3-point arc | `GC_MakeArcOfCircle_point_point_point` + `_Value` — `gc.rs:24-33` | `Edge::arc` — `edge.rs:131` | direct |
| Ellipse (2D) | `Geom2d_Ellipse_new`, `ellipse_value` — `src/geom2d.rs:22-31` | `Edge::ellipse()` is an **empty stub** — `edge.rs:98` | partial |
| Elliptical / hyperbolic / parabolic arcs | — | — | missing — `GC_MakeArcOfEllipse`, `GC_MakeArcOfHyperbola`, `GC_MakeArcOfParabola` are used by build123d |
| Bézier curve | `Geom_BezierCurve_new_points(TColgp_HArray1OfPnt)` + `_to_handle` — `src/geom.rs:61-69` | `Edge::bezier` — `edge.rs:71` | direct |
| B-spline interpolation through points | `GeomAPI_Interpolate_new(points, periodic, tol)`, `Load(v0,v1,scale)`, `Perform`, `_Curve` — `src/geom_api.rs:14-30` | `Edge::spline_from_points` — `edge.rs:100` | direct |
| B-spline approximation | — | — | missing — `GeomAPI_PointsToBSpline` (build123d `Edge.make_spline_approx`) |
| Tangent arc | — | `Edge::tangent_arc` is an **empty stub** — `edge.rs:170` | missing |
| Curve adaptor / sampling | `BRepAdaptor_Curve_new`, `FirstParameter`, `LastParameter`, `BRepAdaptor_Curve_value`, `GetType` — `src/b_rep_adaptor.rs:12-18` | `Edge::start_point`, `end_point`, `edge_type` — `edge.rs:147,155,172` | partial — no `D1`/`D2` derivatives, no `Adaptor3d_Curve` generic, no `BRepAdaptor_CompCurve` (build123d: 8 refs) |
| Deflection tessellation of a curve | `GCPnts_TangentialDeflection` — `src/gc_pnts.rs:11-22` | `Edge::approximation_segments` — `edge.rs:163` (hard-codes deflection 0.1/0.1) | partial |
| Arc-length / parameter at distance | — | — | missing — `GCPnts_AbscissaPoint` (build123d: 19 refs, underpins `Edge.length`, `@` position-along-curve, `Wire.param_at_point`) |
| Wire from edges | `BRepBuilderAPI_MakeWire_new`, `add_edge`, `add_wire`, `Wire()` — `b_rep_builder_api.rs:55-76` | `Wire::from_edges`, `from_wires`, `from_ordered_points` — `wire.rs:73,122,52` | direct |
| Wire from unordered edges | `ShapeAnalysis_FreeBounds::ConnectEdgesToWires` — `src/shape_analysis.rs:11-18`; `Handle_TopTools_HSequenceOfShape` helpers — `top_tools.rs:54-72` | `Wire::from_unordered_edges(…, EdgeConnection)` — `wire.rs:83` | direct |
| Polygon helper | — | `Workplane::rect` / `Sketch` builder — `workplane.rs:188,219-317` | partial (`BRepBuilderAPI_MakePolygon` unbound) |
| Curve↔surface intersection | `BRepIntCurveSurface_Inter` — `src/b_rep_int_curve_surface.rs:14-33` | `Shape::faces_along_line` — `shape.rs:796` | direct |
| 2D geometry package | `Geom2d_Curve`, `Geom2d_Ellipse`, `Geom2d_TrimmedCurve`, `GCE2d_MakeSegment` — `src/geom2d.rs`, `gc.rs:18-22` | not surfaced | needs lower-level binding — nothing from `Geom2dGcc_*` (tangent-circle/line constraints; build123d's `constrained_lines.py` uses 7 distinct `Geom2dGcc_*` classes) |

### 2.6 Faces and sketches

| Capability | `opencascade-sys` | `opencascade` | Status |
| --- | --- | --- | --- |
| Face from wire | `BRepBuilderAPI_MakeFace_wire(wire, only_plane)` — `b_rep_builder_api.rs:78-84` | `Face::from_wire` (`only_plane=false`), `Wire::to_face` — `face.rs:37`, `wire.rs:258` | direct |
| Face with holes | `BRepBuilderAPI_MakeFace::Add(wire)` as `add_wire` — `b_rep_builder_api.rs:94` | `Face::from_wire_with_holes` (`only_plane=true`) — `face.rs:45` | direct |
| Face from surface | `BRepBuilderAPI_MakeFace_surface(Handle_Geom_Surface, tol)` — `b_rep_builder_api.rs:85-88` | `Face::from_surface` — `face.rs:56` | direct |
| Bézier surface | `Geom_BezierSurface_new(TColgp_Array2OfPnt)`, `bezier_to_surface` — `geom.rs:53-59` | `Surface::bezier` — `primitives/surface.rs:11` | direct |
| Cylindrical surface | `Geom_CylindricalSurface_new(gp_Ax3, r)`, `cylinder_to_surface` — `geom.rs:44-51` | none | needs lower-level binding |
| Plane from surface | `new_HandleGeomPlane_from_HandleGeomSurface`, `handle_geom_plane_location` — `geom.rs:71-75` | used in `kicad.rs` only | needs lower-level binding |
| Surface of a face | `BRep_Tool_Surface` — `src/b_rep.rs:24` | used by `Face::normal_at` — `face.rs:297` | direct |
| Outer wire of a face | `outer_wire` → `BRepTools::OuterWire` — `b_rep_tools.rs:14`, `include/b_rep_tools.hxx:6-8` | `Face::outer_wire` — `face.rs:401` | direct |
| Face normal at UV | `BRepGProp_Face::Normal(u,v,&pnt,&vec)` — `src/b_rep_g_prop.rs:38-47` | `Face::normal_at`, `normal_at_center` — `face.rs:296,313` | direct |
| Point→surface projection | `GeomAPI_ProjectPointOnSurf_new`, `LowerDistanceParameters` — `geom_api.rs:32-38` | used by `Face::normal_at` — `face.rs:298` | partial — no `NbPoints`/`Point`/`LowerDistance` accessors |
| Sketch/workplane DSL | n/a (pure Rust, `glam::DAffine3`) | `Workplane` + `Sketch` — `src/workplane.rs:55-317` (`move_to`, `line_to`, `line_dx`, `line_dy`, `arc`, `three_point_arc`, `close`) | direct, but much thinner than build123d's `BuildLine`/`BuildSketch` |
| Surface type introspection | `DynamicType(Handle_Geom_Surface)` + `type_name` — `geom.rs:30`, `src/standard.rs:9` | string comparison in `kicad.rs` | partial — no `BRepAdaptor_Surface::GetType()`/`GeomAbs_SurfaceType` enum |
| Sewing faces into a shell | — | — | missing — `BRepBuilderAPI_Sewing` (build123d: 4 refs) |
| Filling / patch from constraints | — | — | missing — `BRepOffsetAPI_MakeFilling` (build123d: 4 refs, `Face.make_surface`) |
| Point-in-face classification | — | — | missing — `IntTools_FClass2d` / `BRepClass_FaceClassifier` |

### 2.7 Extrusion, revolution, loft, sweep

| Capability | `opencascade-sys` | `opencascade` | Status |
| --- | --- | --- | --- |
| Linear extrude (prism) | `BRepPrimAPI_MakePrism_new(shape, gp_Vec, copy, canonize)` — `b_rep_prim_api.rs:15-25` | `Face::extrude` → `Solid` — `face.rs:66`; `CompoundFace::extrude` → `Shape` — `face.rs:450` | direct |
| Semi-infinite prism (`gp_Dir`, `Inf`) | — | — | missing (only the `gp_Vec` ctor is bound) |
| Revolve | `BRepPrimAPI_MakeRevol_new(shape, gp_Ax1, angle, copy)` — `b_rep_prim_api.rs:27-37` | `Face::revolve`, `CompoundFace::revolve` — `face.rs:127,466` | direct |
| Draft/tapered extrude | `BRepFeat_MakeDPrism_new(shape, profile_base, sketch_base, angle, fuse, modify)`, `perform_until_face`, `perform_with_height` — `src/b_rep_feat.rs:12-27` | `Face::extrude_to_face`, `Face::subtractive_extrude` — `face.rs:82,105` (both hard-code `angle = 0.0`) | partial — the draft angle is never exposed |
| Loft (through sections) | `BRepOffsetAPI_ThruSections_new(is_solid)`, `AddWire`, `CheckCompatibility` — `b_rep_offset_api.rs:97-106` | `Solid::loft` (`is_solid=true`) — `solid.rs:44`; `Shell::loft` (`is_solid=false`) — `shell.rs:22` | partial — the `ruled` ctor flag and `SetSmoothing`/`AddVertex`/`SetMaxDegree` are unbound, and `CheckCompatibility(true)` is hard-coded |
| Pipe sweep (simple) | `BRepOffsetAPI_MakePipe_new(spine_wire, profile_shape)` — `b_rep_offset_api.rs:66-72` | `Face::sweep_along` → `Solid` (`face.rs:236`), `Wire::sweep_along` → `Shell` (`wire.rs:202`) | partial — **no `Build`/`IsDone` is bound for `MakePipe`** (`b_rep_offset_api.rs:66-72` declares only `Shape`), so failures surface as an OCCT throw inside `Shape()` |
| Pipe shell (evolved sweep) | `BRepOffsetAPI_MakePipeShell_new(spine)`, `SetMode(is_frenet)`, `Add(profile, contact, correction)`, `SetLaw(...)`, `Build`, `MakeSolid`, `Shape` — `b_rep_offset_api.rs:74-95` | `make_pipe_shell_with_law_function` is `pub(crate)` — `src/make_pipe_shell.rs:5`; reachable only via `Face::sweep_along_with_radius_values` / `Wire::sweep_along_with_radius_values` — `face.rs:249`, `wire.rs:215` | partial / needs lower-level binding |
| Sweep with **auxiliary spine** | — (`SetMode(TopoDS_Wire aux, CurvilinearEquivalence, KeepContact)` not bound; only the `bool is_frenet` overload is) | — | missing — build123d's `sweep(path, multisection, is_frenet, binormal)` needs it |
| Sweep with binormal / fixed trihedron | — (`SetMode(gp_Dir)`, `SetMode(gp_Ax2)`, `SetMode(TopoDS_Shape SpineSupport)` unbound) | — | missing |
| Law function for evolved sweep | `Law_Interpol_new`, `Set(TColgp_Array1OfPnt2d, periodic)`, `Law_Interpol_into_Law_Function`, `Law_Function_to_handle` — `src/law.rs:11-26` | `law_function_from_graph` is `pub(crate)` — `src/law_function.rs:7` | needs lower-level binding |
| Thick solid / shelling | `BRepOffsetAPI_MakeThickSolid_new`, `MakeThickSolidByJoin(shape, closing_faces, offset, tol, mode, intersection, self_intersection, join, remove_edges, progress)` — `b_rep_offset_api.rs:42-64` | `Shape::hollow(offset, faces_to_remove)` and `Shape::offset_surface` — `shape.rs:872,909` | direct, but `tol` is hard-coded to `0.001` and `join_type` to `GeomAbs_Arc` (`shape.rs:891-898`) |
| 2D offset of wire/face | `BRepOffsetAPI_MakeOffset_{face,wire}_new(…, GeomAbs_JoinType)`, `Perform(offset, alt)` — `b_rep_offset_api.rs:26-40` | `Face::offset`, `Wire::offset` — `face.rs:222`, `wire.rs:189` | partial — the `IsOpenResult` ctor flag is unbound, and `JoinType::Tangent` is deliberately commented out because it segfaults (`primitives.rs:243-244,253`) |
| 3D offset of a solid | — | — | missing — `BRepOffset_MakeOffset` (build123d: 4 refs) is distinct from `MakeThickSolid` |
| Draft angle | — | — | missing — `BRepOffsetAPI_DraftAngle` |
| Drill cylindrical hole | `BRepFeat_MakeCylindricalHole_new`, `Init`, `Perform(radius)`, `Build`, `Shape` — `b_rep_feat.rs:29-39` | `Shape::drill_hole` — `shape.rs:917` | direct |

### 2.8 Fillets and chamfers

| Capability | `opencascade-sys` | `opencascade` | Status |
| --- | --- | --- | --- |
| 3D constant-radius fillet | `BRepFilletAPI_MakeFillet_new(shape)`, `add_edge(radius, edge)` — `b_rep_fillet_api.rs:15-21` | `Shape::fillet_edge`, `fillet_edges`, `fillet` — `shape.rs:451,470,523`; `Solid::fillet_edge` — `solid.rs:31`; `BooleanShape::fillet_new_edges` — `boolean_shape.rs:31` | direct |
| 3D variable-radius fillet | `Add(TColgp_Array1OfPnt2d, edge)` as `variable_add_edge` — `b_rep_fillet_api.rs:23-27` | `Shape::variable_fillet_edge`/`variable_fillet_edges` — `shape.rs:456,485`; `BooleanShape::variable_fillet_new_edges` — `boolean_shape.rs:36` | direct |
| Asymmetric / 2-radius fillet | — | — | missing (`Add(r1, r2, edge)` overload unbound) |
| Fillet shape/continuity (`SetFilletShape`, `ChFi3d_FilletShape`) | — | — | missing |
| 3D chamfer (equal distance) | `BRepFilletAPI_MakeChamfer_new(shape)`, `add_edge(distance, edge)` — `b_rep_fillet_api.rs:60-66` | `Shape::chamfer_edge`, `chamfer_edges`, `chamfer` — `shape.rs:465,507,529`; `ChamferMaker` — `shape.rs:944-962` | direct |
| 3D chamfer, two distances or distance+angle | — (only `Add(Standard_Real, edge)` bound) | `Face::chamfer` hard-codes `distance_2 = distance_1` with a `TODO` — `face.rs:176-179` | missing — build123d's `chamfer(length, length2, angle)` needs `Add(d1,d2,E,F)` and `AddDA(d,ang,E,F)` |
| 2D fillet (on a planar face) | `BRepFilletAPI_MakeFillet2d_new(face)`, `_add_fillet(vertex, radius)` — `b_rep_fillet_api.rs:32-41` | `Face::fillet` `face.rs:144`; `Wire::fillet` `wire.rs:170` | direct |
| 2D chamfer | `_add_chamfer(e1, e2, d1, d2)`, `_add_chamfer_angle(edge, vertex, dist, angle)` — `b_rep_fillet_api.rs:42-55` | `Face::chamfer` `face.rs:176`; `Wire::chamfer` `wire.rs:180` | partial — both high-level wrappers apply to **every** vertex of the face, with no vertex selection |
| Fillet/chamfer status reporting | — (`Status()`, `NbFaultyVertices()`, `HasResult()` unbound) | none | missing |

### 2.9 Measurements and validity

| Capability | `opencascade-sys` | `opencascade` | Status |
| --- | --- | --- | --- |
| Linear properties (edge length) | `BRepGProp::LinearProperties(shape, props, skip_shared, use_triangulation)` — `b_rep_g_prop.rs:16-21` | **none** | needs lower-level binding (no `Edge::length`) |
| Surface properties (area) | `BRepGProp::SurfaceProperties` — `b_rep_g_prop.rs:22-28` | `Face::surface_area` — `face.rs:379`; `Face::center_of_mass` — `face.rs:278` | partial — only on `Face`, not on `Shape`/`Shell`/`Solid` |
| Volume properties | `BRepGProp::VolumeProperties(shape, props, only_closed, skip_shared, use_triangulation)` — `b_rep_g_prop.rs:29-36` | **none** | needs lower-level binding (no `Solid::volume`) |
| `GProp_GProps` accessors | `Mass`, `StaticMoments`, `MomentOfInertia`, `RadiusOfGyration`, `GProp_GProps_CentreOfMass` — `src/g_prop.rs:11-18` | `Mass()` used for area; `CentreOfMass` used for face centroid | partial — moments/inertia reachable but unused; no `PrincipalProperties` |
| Axis-aligned bounding box | `BRepBndLib::Add(shape, Bnd_Box, use_triangulation)` — `src/b_rep_bnd_lib.rs:12-14`; `Bnd_Box` with `IsVoid`, `Get`, `CornerMin/Max`, `GetGap`, `Set`, `SetGap` — `src/bnd.rs:11-28` | `bounding_box::aabb` → `BoundingBox { min, max, gap_vec }` — `src/bounding_box.rs:15-50` | direct |
| Oriented bounding box | — | — | missing — `Bnd_OBB` + `BRepBndLib::AddOBB` (build123d: 8 refs) |
| Distance between shapes | — | — | missing — `BRepExtrema_DistShapeShape` (build123d: 11 refs; underpins `Shape.distance_to`, `closest_points`, `ShapeList.sort_by_distance`) |
| Validity check | — | — | missing — `BRepCheck_Analyzer` (build123d `Shape.is_valid()`), `BRepAlgoAPI_Check` |
| Shape healing | `ShapeUpgrade_UnifySameDomain` — `src/shape_upgrade.rs:10-23` | `Shape::clean` — `shape.rs:752`; `Compound::clean` — `compound.rs:23`; `CompoundFace::clean` — `face.rs:434` | partial — `ShapeFix_Shape`, `ShapeFix_Solid`, `ShapeFix_Face`, `ShapeFix_Wire`, `ShapeFix_Wireframe` are all unbound (build123d uses all five) |
| Build missing 3D curves | `BRepLib::BuildCurves3d(shape)` — `src/b_rep_lib.rs:12-14` | none | needs lower-level binding |
| Tolerance query | — | — | missing — `BRep_Tool::Tolerance`, `ShapeAnalysis::*` |
| Meshing | `BRepMesh_IncrementalMesh(shape, deflection)`, `IsDone`, `Shape` — `src/b_rep_mesh.rs:10-17`; `Poly_Triangulation` accessors — `src/poly.rs`; `BRepLib_ToolTriangulatedShape::ComputeNormals` — `b_rep_lib.rs:16-18` | `Mesher` / `Mesh { vertices, uvs, normals, indices }` — `src/mesh.rs:17-118` | direct, but only the 2-arg deflection ctor; no angular deflection, parallel flag, or `IMeshTools_Parameters` |

### 2.10 STEP / STL / BREP import and export

| Capability | `opencascade-sys` | `opencascade` | Status |
| --- | --- | --- | --- |
| STEP read (file) | `STEPControl_Reader_new`, `read_step(reader, String)`, `TransferRoots(progress) -> i32`, `one_shape_step` — `src/step_control.rs:12-23` | `Shape::read_step` — `shape.rs:551` | direct, file-path only |
| STEP write (file) | `STEPControl_Writer_new`, `transfer_shape` (hard-codes `STEPControl_AsIs`, `include/step_control.hxx:13-15`), `write_step` — `step_control.rs:25-36` | `Shape::write_step`, `Shape::write_all_step` — `shape.rs:570,574` | partial — mode is fixed at `AsIs`; no `Interface_Static` unit/schema control |
| STEP with names and colors (XCAF) | — | — | missing — `STEPCAFControl_Reader/Writer`, `XCAFDoc_ShapeTool`, `XCAFDoc_ColorTool`, `TDocStd_Document`, `TDataStd_Name`, `Quantity_ColorRGBA` are _all_ unbound; build123d's `export_step`/`import_step` rely on them (`exporters3d.py`, `importers.py`) |
| STEP read/write to memory | — | — | missing — only `const char*` filename overloads are wrapped |
| STL write | `StlAPI_Writer_new`, `write_stl(writer, shape, String)` — `src/stl_api.rs:10-18` | `Shape::write_stl`, `write_stl_with_tolerance` — `shape.rs:727,731` (meshes first, writes `mesher.inner.Shape()`) | partial — `StlAPI_Writer::ASCIIMode()` is **not** bound, so ASCII/binary cannot be chosen; OCCT's default is binary |
| STL read | — | — | missing — `RWStl::ReadFile` (build123d `brep_from_stl.py`) |
| BREP ASCII write/read | `write_brep_text` → `BRepTools::Write(shape, path)`, `read_brep_text` → `BRepTools::Read` — `src/b_rep_tools.rs:16-19`, `include/b_rep_tools.hxx:10-23` | `Shape::write_brep_text`, `read_brep_text` — `shape.rs:649,660` | partial — file-path only; `Standard_OStream`/`Standard_IStream` overloads (needed for round-tripping through memory) are unwrapped, and `theWithTriangles`/`theWithNormals`/`TopTools_FormatVersion` are not exposed |
| BREP binary write/read | `write_brep_bin` → `BinTools::Write`, `read_brep_bin` → `BinTools::Read` — `src/bin_tools.rs:10-13`, `include/bin_tools.hxx:5-17` | `Shape::write_brep_bin`, `read_brep_bin` — `shape.rs:670,681` | partial — same stream limitation; build123d's `Shape.__getstate__`/pickling uses the stream form (`BinTools` 4 refs in `persistence.py`/`shape_core.py`) |
| IGES read/write | `IGESControl_Reader/Writer` — `src/iges_control.rs:12-34` | `Shape::read_iges`, `write_iges` — `shape.rs:607,626` | direct |
| glTF / 3MF / OBJ / PLY | — | — | missing — `RWGltf_CafWriter` is used by build123d (`exporters3d.py`) |
| DXF / SVG 2D export | — | — | missing (build123d `exporters.py` uses `HLRBRep_Algo` + `HLRAlgo_Projector`, also unbound) |
| Error reporting on IO | — | `Error` enum: `StepReadFailed`, `StepWriteTransferFailed`, `StepWriteFailed`, `StepWriteNoShapes`, `IgesReadFailed`, `IgesWriteFailed`, `BrepReadFailed`, `BrepWriteFailed`, `StlWriteFailed`, `TriangulationFailed`, `UntriangulatedFace`, `NotEnoughPoints`, `KicadReadFailed` — `src/lib.rs:14-42` | partial — the errors carry no OCCT diagnostic text; `Message_Printer`/`Message_Gravity` are unbound |

### 2.11 Shape copying, lifetime, and ownership

| Capability | `opencascade-sys` | `opencascade` | Status |
| --- | --- | --- | --- |
| Owning handle | Every wrapped OCCT object is `UniquePtr<T>` (cxx `std::unique_ptr`), e.g. `TopoDS_Shape_to_owned` — `topo_ds.rs:74` | `Shape { inner: UniquePtr<ffi::topo_ds::TopoDS_Shape> }` — `shape.rs:14` (same pattern for `Vertex`, `Edge`, `Wire`, `Face`, `Shell`, `Solid`, `Compound`, `CompoundFace`) | direct |
| Copy a shape handle | `TopoDS_{Vertex,Edge,Wire,Face,Shell,Solid,Shape,Compound}_to_owned` → `construct_unique<T>(const T&)`, i.e. the C++ **copy constructor** (cheap: `TopoDS_Shape` is a `TShape` handle + location + orientation) — `topo_ds.rs:33,39,45,53,62,70,74,98` | `Shape::from_shape` — `shape.rs:323`; `Face::from_face` — `face.rs:25`; etc. | direct |
| Deep copy (new TShape) | — | — | missing — `BRepBuilderAPI_Copy` is unbound; `*_to_owned` shares the underlying `TShape`, so two "copies" are `IsSame` |
| `Clone` on Rust wrappers | n/a | **No `Clone` impl on any of `Shape`, `Face`, `Wire`, `Edge`, `Solid`, `Shell`, `Compound`, `Vertex`** (verified: only `Angle`, `RVec`, `ShapeType`, `Direction`, `JoinType`, `EdgeType`, `FaceOrientation`, `EdgeConnection`, `Plane`, `Workplane` derive `Clone`) | missing — callers must round-trip through `Shape::from_shape(&other.inner)`; for a JS-facing API this is a real ergonomics hole |
| Borrowed views | cxx returns `&TopoDS_Shape` from `Shape()`/`Current()`/`FindKey()`; lifetimes are tied to the builder (`Pin<&mut T> -> &TopoDS_Shape`) | the high-level crate immediately deep-copies into an owned wrapper everywhere | direct |
| `Send`/`Sync` | `unsafe impl Send` for `TopoDS_{Edge,Wire,Face,Shell,Solid,Compound,Shape}` (`topo_ds.rs:118-124`), `TopExp_Explorer` (`top_exp.rs:75`), `BRepBuilderAPI_MakeWire` (`b_rep_builder_api.rs:140`), `BRepFilletAPI_MakeChamfer` (`b_rep_fillet_api.rs:72`) | none added | partial — **no `Sync`**, and these `Send` impls are asserted without justification; OCCT's `Standard_Transient` refcount is not atomic by default, so moving a `TopoDS_Shape` across threads while another thread holds a handle to the same `TShape` is a data race. For Caddy (Neon, worker threads, N-API) this needs a decision. `[INFERENCE]` — I did not verify OCCT 8.0.1's `Standard_Transient` refcount atomicity. |
| Null-handle safety | `IsNull()` on every `Handle_*`; `handle_try_deref` returns `Result` for `Handle_Poly_Triangulation` (`poly.rs:19`) and `Handle_TopTools_HSequenceOfShape` (`top_tools.rs:72`) | `Shape::read_brep_*` null-check the returned `UniquePtr` (`shape.rs:663,684`); `Mesher::mesh` maps the `Result` to `Error::UntriangulatedFace` (`mesh.rs:45-46`) | partial — every other `Handle_*` deref inside wrapper headers (e.g. `HandleGeomCurve_Value`, `include/geom.hxx:41-43`; `handle_geom_plane_location`, `:24`; `TopTools_HSequenceOfShape_append`, `include/top_tools.hxx:15-17`) dereferences without a null check, which is UB on a null handle |
| Progress/cancel | `Message_ProgressRange_new()` — `src/message.rs:9-10` | a fresh empty range is constructed at every call site | partial — no `Message_ProgressIndicator`, so long operations cannot be cancelled or reported |

---

## 3. Risk notes

### (a) cxx `Result` coverage — almost nothing is fallible, so OCCT throws terminate the process

**Verified.** Across the entire `crates/opencascade-sys/src/` tree, exactly **two** bridge functions return `Result`:

- `poly.rs:19` — `Handle_Poly_Triangulation_Get(...) -> Result<&Poly_Triangulation>`
- `top_tools.rs:72` — `HandleTopTools_HSequenceOfShape_Get(...) -> Result<&TopTools_HSequenceOfShape>`

Both map to `handle_try_deref` (`include/bindings_common.hxx:21-26`), which throws `std::runtime_error` on a null handle. Nothing else — no constructor, no `Build`, no `Shape`, no reader/writer — is declared fallible.

cxx's documented behaviour: _"If an exception is thrown from an `extern "C++"` function that is not declared by the CXX bridge to return Result, the program calls C++'s `std::terminate`. The behavior is equivalent to the same exception being thrown through a `noexcept` C++ function."_ ([cxx.rs/binding/result.html](https://cxx.rs/binding/result.html))

Every one of the following can throw an OCCT `Standard_Failure`, and all of them are non-`Result`:

| Risk class | Representative bindings | Why it throws |
| --- | --- | --- |
| Primitive constructors | `BRepPrimAPI_MakeBox_new` `b_rep_prim_api.rs:52`, `MakeCylinder_new` `:41`, `MakeSphere_new` `:64`, `MakeCone_new` `:75`, `MakeTorus_new` `:88`, `MakePrism_new` `:17`, `MakeRevol_new` `:29` | `Standard_ConstructionError` / `Standard_DomainError` on zero or negative dimensions, degenerate axes |
| Builder constructors | `BRepBuilderAPI_MakeEdge_*` `b_rep_builder_api.rs:33,37,41,46`, `MakeFace_*` `:80,85`, `MakeSolid_new` `:98`, `MakeWire_edge_edge*` `:59,64`, `MakeVertex_gp_Pnt` `:26` | coincident points, non-planar wire, null surface |
| **Every `Shape()` accessor** | all 17 `pub fn Shape(self: Pin<&mut …>) -> &TopoDS_Shape` declarations | `BRepBuilderAPI_MakeShape::Shape()` calls `Build()` then `Check()`, which raises `StdFail_NotDone` — verified at `OCCT-8_0_1/src/ModelingAlgorithms/TKTopAlgo/BRepBuilderAPI/BRepBuilderAPI_MakeShape.cxx:30-39` and declared at `…/BRepBuilderAPI_MakeShape.hxx:44-46` ("Raises exception StdFail_NotDone if the shape was not built") |
| `Build()` calls | all `pub fn Build(…)` declarations in `b_rep_prim_api.rs`, `b_rep_builder_api.rs`, `b_rep_algo_api.rs`, `b_rep_fillet_api.rs`, `b_rep_offset_api.rs`, `b_rep_feat.rs:38` | boolean/fillet/offset algorithm failures |
| Topology downcasts | `TopoDS::{Vertex,Edge,Wire,Face,Shell,Solid,Compound}` — `topo_ds.rs:15-27` | `Standard_TypeMismatch` if the shape is of the wrong type. The high-level crate calls these **unguarded** in `Face::union`/`intersect`/`subtract` (`face.rs:344,368,378`) and in `Shell::loft` (`shell.rs:34`) — e.g. a boolean that yields a `TopoDS_Solid` rather than a compound will terminate the process. |
| Algebraic ops on `Pin<&mut T>` | `BRepFilletAPI_MakeFillet::add_edge` `b_rep_fillet_api.rs:21`, `MakeThickSolidByJoin` `b_rep_offset_api.rs:46`, `TopExp::Vertices` `top_exp.rs:31` | invalid edge, invalid face list |

Additionally, `Shape::drill_hole` calls `BRepFeat_MakeCylindricalHole::Shape()` through a **const** `self` (`b_rep_feat.rs:39`), bypassing any implicit `Build` — relying on the preceding explicit `Build()` at `b_rep_feat.rs:38`.

**Implication for Caddy:** every bridge function that can reach OCCT algorithm code must be declared `-> Result<…>` before it is exposed to Node. A single bad user dimension would otherwise abort the entire Node process, which is unacceptable for a library.

### (b) `Standard_Failure` and `rust::behavior::trycatch` in OCCT 8.0.1

**Verified, and this is good news.** In OCCT 8.0.1:

```cpp
//! Forms the root of the entire exception hierarchy.
//! Inherits from std::exception and implements what() interface.
class Standard_Failure : public std::exception
{
  …
  Standard_EXPORT const char* what() const noexcept override;
  virtual const char* ExceptionType() const noexcept { return "Standard_Failure"; }
  Standard_EXPORT const char* GetStackString() const;
```

— `OCCT-8_0_1/src/FoundationClasses/TKernel/Standard/Standard_Failure.hxx:27-67`.

This is a **change from OCCT 7.x**, where `Standard_Failure` derived from `Standard_Transient`. Consequences:

1. `Standard_Failure` is no longer a handle class; `DEFINE_STANDARD_EXCEPTION(C1, C2)` now only defines constructors plus an `ExceptionType()` override (`OCCT-8_0_1/src/FoundationClasses/TKernel/Standard/Standard_DefineException.hxx:34-53`). The OCCT 7 `Raise`/`NewInstance`/`Handle(Standard_Failure)` API is gone (verified: no `Raise` or `NewInstance` in `Standard_Failure.hxx`).
2. **cxx's default `trycatch` already catches every OCCT exception.** The default is `catch (const std::exception &e) { fail(e.what()); }` ([cxx.rs](https://cxx.rs/binding/result.html)), and `Standard_Failure::what()` returns the OCCT message. So simply changing a bridge signature to `-> Result<T>` is sufficient to convert an OCCT failure into a `cxx::Exception` carrying the OCCT message, with no custom C++ required.
3. A **custom `trycatch`** is still worth writing, to recover the OCCT-specific fields that `what()` drops. cxx looks up `rust::behavior::trycatch` by ordinary name lookup in any header `include!`d by the bridge, so Caddy can put this in a header included first by every bridge (e.g. alongside `bindings_common.hxx`):

    ```cpp
    #include <Standard_Failure.hxx>
    #include <exception>
    #include <string>

    namespace rust::behavior {
    template <typename Try, typename Fail>
    static void trycatch(Try &&func, Fail &&fail) noexcept try {
      func();
    } catch (const Standard_Failure &e) {
      std::string msg = std::string(e.ExceptionType()) + ": " + e.what();
      const char *trace = e.GetStackString();
      if (trace && *trace) { msg += "\n"; msg += trace; }
      fail(msg.c_str());
    } catch (const std::exception &e) {
      fail(e.what());
    }
    } // namespace rust::behavior
    ```

    `Standard_Failure::DefaultStackTraceLength()` defaults to 0 (no stack trace) — `Standard_Failure.hxx:77-79`; `SetDefaultStackTraceLength(n)` (`:82`) turns traces on globally and would let Caddy surface OCCT stacks in dev builds.

4. **Signals are still separate.** `OCC_CATCH_SIGNALS` only converts OS signals (SIGSEGV/SIGFPE) into C++ exceptions, and only when `OCC_CONVERT_SIGNALS` is defined (`OCCT-8_0_1/src/FoundationClasses/TKernel/Standard/Standard_ErrorHandler.hxx:57-89`). `opencascade-sys` defines `OCC_CONVERT_SIGNALS` **only for `windows-gnu`** (`crates/opencascade-sys/build.rs:99-101`), so on macOS/Linux a segfault inside OCCT (e.g. the known `GeomAbs_Tangent` offset crash noted at `crates/opencascade/src/primitives.rs:243`) stays a hard crash.

### (c) Where the high-level crate panics or unwraps on user input

| Location | Trigger | Severity |
| --- | --- | --- |
| `primitives.rs:184` `FaceIterator::farthest` | `.unwrap()` on `try_farthest` → panics on a shape with **no faces** | high — directly reachable from user geometry |
| `primitives.rs:195` | `.expect("Face center of masses should contain no NaNs")` — `partial_cmp` on NaN centroids | medium |
| `workplane.rs:311` `Sketch::close` | `self.first_point.unwrap()` — panics if `close()` is called before any `move_to`/`line_to` | high — pure user-sequencing error |
| `wire.rs:58` `Wire::from_ordered_points` | `points.first().unwrap()`/`last().unwrap()`; guarded by the `len() < 2` check at `wire.rs:54` returning `Error::NotEnoughPoints`, so unreachable in practice | low |
| `face.rs:203-204` `Face::chamfer` | `.expect("Vertex has no edges")` / `.expect("Vertex has only one edge")` — panics on a face whose vertex is not shared by exactly ≥2 edges | high |
| `shape.rs:290,305,320` `expect_wire`/`expect_face`/`expect_solid` | documented panicking accessors | low (opt-in) |
| `bounding_box.rs:48` `aabb` | `.expect("Input shape ref was null")` | low |
| `primitives.rs:76`, `primitives.rs:255`, `edge.rs:33`, `face.rs:553` | `panic!` on an out-of-range enum `repr` returned from C++ | low — defensive |
| `surface.rs:19` `Surface::bezier` | `poles.first().map(len).unwrap_or(0) as i32 - 1` → with empty input the array bound is `-1`, handed to `TColgp_Array2OfPnt_new(0, -1, 0, -1)`, which throws `Standard_RangeError` inside a non-`Result` cxx call → **process terminate** | high |
| `face.rs:344,368,378`; `shell.rs:34`; `face.rs:437` | unguarded `TopoDS::Compound` / `TopoDS::Shell` downcasts on algorithm output | high — terminates rather than panics (see (a)) |

Net: the high-level crate is written for an application (the bundled viewer/examples), not for a library whose inputs come from untrusted JavaScript. Caddy cannot re-export these code paths as-is.

### (d) Reusing `opencascade-sys` types from a downstream cxx bridge

**Type sharing works; build-path propagation does not.**

_Type sharing (works)._ cxx emits an `ExternType` impl for every opaque `extern "C++"` type, so a downstream bridge re-declares the type by aliasing it:

```rust
#[cxx::bridge]
mod ffi {
    unsafe extern "C++" {
        include!("my-crate/include/my_wrapper.hxx");
        type TopoDS_Shape = opencascade_sys::topo_ds::TopoDS_Shape;
        type TopoDS_Face  = opencascade_sys::topo_ds::TopoDS_Face;
        type Message_ProgressRange = opencascade_sys::message::Message_ProgressRange;

        fn my_split(shape: &TopoDS_Shape, tool: &TopoDS_Shape) -> Result<UniquePtr<TopoDS_Shape>>;
    }
}
```

This is exactly the mechanism `opencascade-sys` already uses between its own 41 bridge modules (e.g. `type TopoDS_Shape = crate::topo_ds::TopoDS_Shape;` at `b_rep_prim_api.rs:12`). Note the module path is per-header: `opencascade_sys::topo_ds::…`, `opencascade_sys::gp::…`, `opencascade_sys::geom::…`, not a flat `ffi::`.

Two caveats:

- `UniquePtr<T>` for an externally-defined `T` requires the defining crate to have emitted the `UniquePtrTarget` impl. `opencascade-sys` does this implicitly for every type it declares, and explicitly for the `Handle_*` wrappers via the `impl UniquePtr<Handle_…> {}` blocks (`geom.rs:93-100`, `geom2d.rs:45-47`, `poly.rs:66`, `law.rs:29`, `top_tools.rs:75`). For types where the downstream crate wants `UniquePtr`/`CxxVector` and upstream did not emit the impl, the downstream bridge must add its own `impl UniquePtr<T> {}` block — which cxx rejects for foreign types, so the alternative is to return `*mut T` + a wrapper, or to patch the vendored crate.
- `type X = other_crate::X;` requires `other_crate::X` to be the _same_ `type_id`, i.e. the same C++ fully-qualified name. All `opencascade-sys` types are in the global namespace, so this holds.

_Build paths (broken upstream)._ Upstream `crates/opencascade-sys/Cargo.toml` has **no `links` key** (verified: the manifest is 19 lines, keys are `[package]`, `[dependencies]`, `[build-dependencies]`, `[features]`). Cargo therefore emits **no** `DEP_*` metadata from its build script, and a downstream crate's `build.rs` has no supported way to learn the OCCT include/lib directories. `crates/occt-sys/Cargo.toml` likewise has no `links` key.

How upstream resolves OCCT itself (`crates/opencascade-sys/build.rs:139-190`):

1. prints `cargo:rerun-if-env-changed=DEP_OCCT_ROOT` (`:140`);
2. with `feature = "builtin"`, calls `occt_sys::build_occt()` then **manually** `std::env::set_var("DEP_OCCT_ROOT", occt_sys::occt_path())` (`:144-146`) — `occt_path()` is `OUT_DIR/../../../../OCCT`, i.e. a shared `target/<triple>/OCCT` directory (`crates/occt-sys/src/lib.rs:13-17`);
3. runs `cmake::Config::new("OCCT").register_dep("occt").build()` (`:150`), where `OCCT/CMakeLists.txt` is a 16-line probe that does `find_package(OpenCASCADE REQUIRED)` and writes `occ_info.txt` with `VERSION_MAJOR`, `VERSION_MINOR`, `INCLUDE_DIR`, `LIBRARY_DIR`, `BUILD_SHARED_LIBS`;
4. parses `occ_info.txt` (`:153-172`) and emits `cargo:rustc-link-search=native=…` plus 24 `cargo:rustc-link-lib=…` lines (`:41-46`).

So a downstream crate has three options, in increasing order of soundness:

- re-run the same probe itself (copy `OCCT/CMakeLists.txt`, call `cmake::Config::new("OCCT")`), duplicating work but staying decoupled;
- set `DEP_OCCT_ROOT` / `CMAKE_PREFIX_PATH` / `OpenCASCADE_DIR` in the environment for the whole build;
- **add `links` to the sys crate and emit the paths as build metadata.** This is what Caddy's vendored copy already does: `packages/occt-native/vendor/opencascade-sys/Cargo.toml` adds `links = "opencascade"`, and its `build.rs` emits `cargo:include=`, `cargo:lib_dir=`, and `cargo:version=`, which Cargo exposes downstream as `DEP_OPENCASCADE_INCLUDE`, `DEP_OPENCASCADE_LIB_DIR`, `DEP_OPENCASCADE_VERSION`. That is the right fix and it is already in place.

### (e) OCCT 8 compatibility

I scanned every OCCT class named in the 41 wrapper headers and the 41 bridge modules against the OCCT 8.0.1 source tree. **Every header exists** and every signature the bridges rely on still matches. The breakages are of a different kind.

**E1 — The version gate rejects OCCT 8 outright (hard blocker).** `crates/opencascade-sys/build.rs:4` declares `const OCCT_VERSION: (u8, u8) = (7, 8);` and `:175` panics when `version_major != OCCT_VERSION.0 || version_minor < OCCT_VERSION.1`. With OCCT 8.0.1 both clauses fire (`8 != 7`, and `0 < 8`). Caddy's vendored copy replaces this with `(version_major, version_minor) < OCCT_VERSION || version_major > OCCT_MAX_MAJOR` where `OCCT_MAX_MAJOR = 8` — correct.

**E2 — `Handle_<Class>` typedefs are gone (hard blocker, already patched in Caddy's vendor).** OCCT 8.0.1 still _defines_ the `DEFINE_STANDARD_HANDLE` macro (`OCCT-8_0_1/src/FoundationClasses/TKernel/Standard/Standard_Handle.hxx:498`) but almost nothing invokes it: a tree-wide grep finds **only 4 header files** containing `DEFINE_STANDARD_HANDLE`, three of which are the macro definitions themselves, plus `Standard_Type.hxx:199`, `math_SingularMatrix.hxx:25`, and `math_NotSquare.hxx:25`. Classes now spell handles as `occ::handle<T>` / `Handle(T)` directly (e.g. `BRep_Tool::Curve` returns `const occ::handle<Geom_Curve>&`, `OCCT-8_0_1/src/ModelingData/TKBRep/BRep/BRep_Tool.hxx:101`).

The bridges name 16 such typedefs (`Handle_Geom_Curve`, `Handle_Geom_Surface`, `Handle_Geom_BSplineCurve`, `Handle_Geom_BezierCurve`, `Handle_Geom_BezierSurface`, `Handle_Geom_TrimmedCurve`, `Handle_Geom_Plane`, `Handle_Geom_CylindricalSurface`, `Handle_Geom2d_Curve`, `Handle_Geom2d_Ellipse`, `Handle_Geom2d_TrimmedCurve`, `Handle_Law_Function`, `Handle_Poly_Triangulation`, `Handle_Standard_Type`, `Handle_TColgp_HArray1OfPnt`, `Handle_TopTools_HSequenceOfShape`) and would fail to compile. Caddy's vendored `packages/occt-native/vendor/opencascade-sys/include/occt_compat.hxx` restores all 16 as `typedef opencascade::handle<T> Handle_T;`. Two notes on that file:

- `Handle_Standard_Type` **does** still exist in OCCT 8 (`Standard_Type.hxx:199`) but marked `Standard_DEPRECATED`; redeclaring an identical typedef is legal in C++, so the compat header is harmless there on clang/gcc. On MSVC the macro produces a _class_ rather than a typedef (`Standard_Handle.hxx:466-489`), and a same-named typedef would be a hard error — a cross-compile hazard if Caddy ever targets MSVC. `[INFERENCE]` — not tested.
- `namespace occ` is a thin alias (`template <class T> using handle = opencascade::handle<T>;`, `Standard_Handle.hxx:415-421`) and `#define Handle(Class) opencascade::handle<Class>` is unchanged (`:447`), so `opencascade::handle<T>` in `bindings_common.hxx` and the wrapper headers still compiles.

**E3 — `TopTools_*` and `TColgp_*` are now deprecated alias headers (warning noise, not a break).** In OCCT 8 these moved to `src/Deprecated/NCollectionAliases/` and became `Standard_DEPRECATED` typedefs over `NCollection_*`:

- `TopTools_ListOfShape` → `NCollection_List<TopoDS_Shape>` (`OCCT-8_0_1/src/Deprecated/NCollectionAliases/TopTools_ListOfShape.hxx:30`)
- `TopTools_IndexedMapOfShape` → `NCollection_IndexedMap<TopoDS_Shape, TopTools_ShapeMapHasher>`
- `TopTools_HSequenceOfShape` → `NCollection_HSequence<TopoDS_Shape>`
- `TColgp_Array1OfDir/Array1OfPnt2d/Array2OfPnt/HArray1OfPnt` → `NCollection_Array1/Array2/HArray1<…>`

They are installed unconditionally (`OCCT-8_0_1/CMakeLists.txt:1107-1109`), and `Standard_HEADER_DEPRECATED` expands to a warning, not an error (`Standard_Macro.hxx:53`). The bridges compile, with a deprecation warning per inclusion. Since the aliases are _typedefs_, the cxx-declared types resolve to the right C++ entities, and `BRepOffsetAPI_MakeThickSolid::MakeThickSolidByJoin(…, const NCollection_List<TopoDS_Shape>&, …)` (`OCCT-8_0_1/src/ModelingAlgorithms/TKOffset/BRepOffsetAPI/BRepOffsetAPI_MakeThickSolid.hxx:103-105`) binds correctly to the bridge's `&TopTools_ListOfShape` (`b_rep_offset_api.rs:48`). Recommendation: replace the alias names with `NCollection_*` in Caddy's own bridges to pre-empt their removal.

**E4 — one deprecated overload is still used.** `ShapeAnalysis_FreeBounds::ConnectEdgesToWires(edges, toler, shared, wires)` is marked `Standard_DEPRECATED("Use ConnectEdgesToWires() returning handle by value instead")` in OCCT 8 (`OCCT-8_0_1/src/ModelingAlgorithms/TKShHealing/ShapeAnalysis/ShapeAnalysis_FreeBounds.hxx:128-134`); the bridge uses exactly that 4-argument form (`src/shape_analysis.rs:13-18`). It still resolves and compiles; switching to the 3-argument value-returning overload would need a wrapper that converts the returned handle into a `UniquePtr`.

**E5 — Things I checked and found unchanged.** All 24 toolkit names in `OCCT_LIBS` (`build.rs:7-32`) exist as toolkit directories in OCCT 8.0.1 (`TKMath`, `TKernel`, `TKDE`, `TKFeat`, `TKGeomBase`, `TKG2d`, `TKG3d`, `TKTopAlgo`, `TKGeomAlgo`, `TKBRep`, `TKPrim`, `TKDESTEP`, `TKDEIGES`, `TKDESTL`, `TKMesh`, `TKShHealing`, `TKFillet`, `TKBool`, `TKBO`, `TKOffset`, `TKXSBase`, `TKCAF`, `TKLCAF`, `TKXCAF`). `Standard_Boolean`/`Standard_Real`/`Standard_Integer` are still typedef'd (`Standard_TypeDef.hxx:80`). Every enum the bridges mirror has identical members and order: `TopAbs_ShapeEnum`, `TopAbs_Orientation`, `GeomAbs_CurveType`, `GeomAbs_JoinType`, `BOPAlgo_GlueEnum`, `IFSelect_ReturnStatus`, `BRepOffset_Mode` — and all are plain `enum`, not `enum class`, which matters because cxx's generated `static_assert`s reference unqualified enumerators. Signatures verified unchanged: `TopoDS_Shape::Move(loc, raiseExc=false)` / `Location(loc, raiseExc=false)` (`TopoDS_Shape.hxx:95,193`), `BRepGProp::{Linear,Surface,Volume}Properties` (`BRepGProp.hxx:88,133,196`), `BRepTools::Write(shape, const char*, progress) -> bool` and `Read(...) -> bool` (`BRepTools.hxx:323,351`), `BRepTools::OuterWire` (`:258`), `BinTools::Write/Read -> bool` (`BinTools.hxx:97,124`), `StlAPI_Writer::Write` (`StlAPI_Writer.hxx:43`), `BRepLib_ToolTriangulatedShape::ComputeNormals` (`:31,43`), `TopExp::Vertices` both overloads and `CommonVertex` (`TopExp.hxx:126,137,145`), `Poly_Triangulation(nbNodes, nbTriangles, hasUV, hasNormals)` (`Poly_Triangulation.hxx:77`), `BRepPrimAPI_MakePrism(S, V, Copy, Canonize)` (`:56`), `BRepPrimAPI_MakeRevol(S, A, D, Copy)` (`:70`), `BRepOffsetAPI_MakeOffset(Face|Wire, Join, IsOpenResult)` and `Perform(Offset, Alt)` (`:47,63,83`), `BRepOffsetAPI_MakePipeShell::SetLaw/SetMode/Add/MakeSolid` (`:152,70,133,260`), `BRepOffsetAPI_ThruSections::AddWire/CheckCompatibility` (`:88,100`), `BRepFilletAPI_MakeFillet2d::AddFillet/AddChamfer` (`:114,154`), `BRepFeat_MakeCylindricalHole::Perform/Build` (`:53,96`), `BRepBuilderAPI_MakeShapeOnMesh(const occ::handle<Poly_Triangulation>&)` (`:32`), `BRepAlgoAPI_BuilderAlgo::SectionEdges/SetGlue` (`:193,107`), `GCPnts_TangentialDeflection(const Adaptor3d_Curve&, …)` (`:77` — `BRepAdaptor_Curve` upcasts), `GeomAPI_Interpolate::Load(gp_Vec, gp_Vec, bool)` (`:143`), `ShapeUpgrade_UnifySameDomain::Shape() const` (`:135`), `gp_Trsf::{SetMirror,SetScale,SetTranslation,SetTranslationPart,Value}` (`:90,114,181,184,260`), `gp_GTrsf::{SetValue,Value}` (`:115,178`), `BRepLib::BuildCurves3d(S)` (`:107`), `Bnd_Box` accessors (`:118,143,146,161,201,208,265`), `NCollection_List::{begin,end,Append}` (`:50,53,182`).

**E6 — C++ standard.** Upstream compiles with `-std=c++11` (`build.rs:110`). OCCT 8.0.1 headers use C++17 constructs (`[[nodiscard]]`, inline `constexpr` members, `override` on destructors). Caddy's vendor already bumps this to `-std=c++17`.

---

## 4. Gaps Caddy must fill

Ordered by how directly each blocks a build123d behaviour. "b123d" column cites where build123d 0.13.0 needs it.

### Blocking — no binding exists at any level

| # | Gap | OCCT entry point | b123d usage |
| --- | --- | --- | --- |
| 1 | **Robust error propagation** — convert every fallible bridge fn to `-> Result<…>` plus a custom `rust::behavior::trycatch` that reads `Standard_Failure::ExceptionType()`/`what()`/`GetStackString()` | — | `Standard_Failure` (19 refs), `StdFail_NotDone` (15), `Standard_ConstructionError` (11), `Standard_TypeMismatch` (5), `Standard_NoSuchObject` (4) |
| 2 | **Splitting / sectioning a shape by a tool** | `BRepAlgoAPI_Splitter`, `BOPAlgo_Splitter`, `BRepFeat_SplitShape` | `Shape.split`, `split()` operation (`BRepAlgoAPI_Splitter` 8 refs) |
| 3 | **Distance / closest points** | `BRepExtrema_DistShapeShape`, `BRepExtrema_SupportType` | `Shape.distance_to`, `closest_points`, `ShapeList.sort_by_distance` (11 refs) |
| 4 | **Validity checking** | `BRepCheck_Analyzer` | `Shape.is_valid()` (3 refs) |
| 5 | **Shape healing** | `ShapeFix_Shape`, `ShapeFix_Solid`, `ShapeFix_Face`, `ShapeFix_Wire`, `ShapeFix_Wireframe` | `Shape.fix()`, `Solid.clean`, sketch repair (17 refs combined) |
| 6 | **Edge/wire length and parameterisation** | `GCPnts_AbscissaPoint`, `GCPnts_QuasiUniformDeflection`, `GCPnts_UniformDeflection`, `BRepAdaptor_CompCurve` | `Edge.length`, `Wire.length`, `@` position-along-curve, `param_at_point` (19 + 8 refs) |
| 7 | **Volume and mass properties on `Shape`** | `BRepGProp::VolumeProperties` (**bound at sys level**, unused), `GProp_GProps::PrincipalProperties` | `Shape.volume`, `Solid.volume`, `center(CenterOf.MASS)` (24 refs) |
| 8 | **Oriented bounding box** | `Bnd_OBB`, `BRepBndLib::AddOBB` | `Shape.bounding_box(optimal=…)` (8 refs) |
| 9 | **Non-uniform scale / `gp_GTrsf`** | `gp_GTrsf::{SetAffinity,SetVectorialPart,SetTranslationPart,SetValues}` + `BRepBuilderAPI_GTransform` (**ctor already bound**) | `Shape.scale` with per-axis factors (12 refs) |
| 10 | **Mirror about a plane** | `gp_Trsf::SetMirror(const gp_Ax2&)` and `SetMirror(const gp_Pnt&)` | `mirror(about=Plane.XZ)` — the dominant build123d mirror form |
| 11 | **Quaternion / Euler rotation** | `gp_Quaternion`, `gp_EulerSequence`, `gp_Trsf::SetRotation(gp_Quaternion)` | `Rotation`, `Location`, `Plane.rotated` (27 + 7 refs) |
| 12 | **Sweep with auxiliary spine / binormal** | `BRepOffsetAPI_MakePipeShell::SetMode(TopoDS_Wire, bool, BRepFill_TypeOfContact)`, `SetMode(gp_Dir)`, `SetMode(gp_Ax2)`; `GeomFill_Frenet`, `GeomFill_CorrectedFrenet`, `GeomFill_TrihedronLaw` | `sweep(path, binormal=…, is_frenet=…)` (8 + 6 refs) |
| 13 | **Loft with `ruled` flag and multi-section control** | `BRepOffsetAPI_ThruSections(isSolid, ruled, pres3d)`, `SetSmoothing`, `AddVertex` | `loft(ruled=True)` |
| 14 | **Two-distance / distance-angle chamfer** | `BRepFilletAPI_MakeChamfer::Add(d1,d2,E,F)` and `AddDA(d,angle,E,F)` | `chamfer(length, length2=…, angle=…)` |
| 15 | **Ordered wire traversal** | `BRepTools_WireExplorer` | `Wire.order_edges`, `Wire.to_wire` (6 refs) |
| 16 | **Deep copy** | `BRepBuilderAPI_Copy` | `copy.deepcopy(shape)` (2 refs); also required for a sane `Clone` in Caddy's JS object model |
| 17 | **Shape identity/hashing** | `TopoDS_Shape::IsSame`, `std::hash<TopoDS_Shape>`, `TopTools_ShapeMapHasher` | `ShapeList` dedup, `Shape.__hash__` (2 refs) |
| 18 | **Sewing** | `BRepBuilderAPI_Sewing` | `Shell`/`Solid` construction from loose faces (4 refs) |
| 19 | **Surface filling** | `BRepOffsetAPI_MakeFilling` | `Face.make_surface(exterior, surface_points, interior_wires)` (4 refs) |
| 20 | **Projection onto a shape** | `BRepProj_Projection`, `GeomAPI_ProjectPointOnCurve`, `GeomAPI_IntCS`, `GeomAPI_IntSS`, `GeomAPI_ExtremaCurveCurve` | `Shape.project_to_shape`, `project()`, `Plane.intersect` (5 + 5 + 2 + 2 + 2 refs) |
| 21 | **Boolean history** | `BRepTools_History`, `BRepAlgoAPI_BooleanOperation::{Modified,Generated,IsDeleted}`, `BRepTools_ReShape` | `Shape.clean` tracking, `ShapeList` provenance (10 + 2 refs) |
| 22 | **STEP with names and colours (XCAF)** | `STEPCAFControl_Reader/Writer`, `XCAFApp_Application`, `TDocStd_Document`, `XCAFDoc_DocumentTool`, `XCAFDoc_ShapeTool`, `XCAFDoc_ColorTool`, `XCAFDoc_ColorType`, `TDF_Label`, `TDataStd_Name`, `Quantity_ColorRGBA`, `TCollection_{Ascii,Extended}String` | `export_step`, `import_step` round-trip of labels/colours (≈70 refs across `exporters3d.py`/`importers.py`) |
| 23 | **BREP/STEP to and from memory** | `BRepTools::{Write,Read}(…, Standard_OStream&/Standard_IStream&)`, `BinTools::{Write,Read}` stream overloads, `STEPControl_Writer::WriteStream` | `Shape.__getstate__`/`__setstate__`, `Shape.__hash__` via serialised BREP (4 refs) |
| 24 | **STL options and STL read** | `StlAPI_Writer::ASCIIMode()`, `RWStl::ReadFile` | `export_stl(ascii_format=…)`, `brep_from_stl.py` (3 refs) |
| 25 | **3D offset of a solid** | `BRepOffset_MakeOffset` (distinct from `MakeThickSolid`) | `offset()` on solids (4 refs) |
| 26 | **2D constraint solving** | `Geom2dGcc_{Circ2d2TanOn,Circ2d2TanRad,Circ2d3Tan,Circ2dTanCen,Circ2dTanOnRad,Lin2d2Tan,Lin2dTanObl,QualifiedCurve}`, `Geom2dAPI_InterCurveCurve`, `Geom2dAPI_ProjectPointOnCurve`, `Geom2dAdaptor_Curve` | `constrained_lines.py` — `TangentArc`, tangent/radius line constructions (≈35 refs) |
| 27 | **Elliptical/hyperbolic/parabolic arcs, spline approximation** | `GC_MakeArcOfEllipse`, `GC_MakeArcOfHyperbola`, `GC_MakeArcOfParabola`, `GeomAPI_PointsToBSpline`, `GeomAPI_PointsToBSplineSurface`, `GeomConvert_{BSplineCurveToBezierCurve,CompCurveToBSplineCurve}` | `objects_curve.py` arc family, `Edge.make_spline_approx` |
| 28 | **Face/surface type introspection** | `BRepAdaptor_Surface::GetType()`, `GeomAbs_SurfaceType`, `BRepLProp_SLProps`, `BRepLib_FindSurface` | `Face.geom_type`, `Face.normal_at`, `Shape.is_planar` (5 + 2 + 4 refs) |
| 29 | **Point-in-face classification** | `IntTools_FClass2d` | `Face.is_inside` (2 refs) |
| 30 | **Draft angle feature** | `BRepOffsetAPI_DraftAngle`, and exposing the existing `BRepFeat_MakeDPrism` angle parameter | `taper` arguments on `extrude`/`revolve` (2 refs) |
| 31 | **Wedge and half-space primitives** | `BRepPrimAPI_MakeWedge`, `BRepPrimAPI_MakeHalfSpace` | `Wedge` object; half-space used in `split()` (2 + 3 refs) |
| 32 | **Hidden-line removal for 2D export** | `HLRBRep_Algo`, `HLRBRep_HLRToShape`, `HLRAlgo_Projector` | `ExportSVG`/`ExportDXF` (7 refs) |
| 33 | **glTF export** | `RWGltf_CafWriter` | `export_gltf` (2 refs) |
| 34 | **Diagnostics plumbing** | `Message`, `Message_Gravity`, `Message_Printer`, `Message_ProgressIndicator`, `Interface_Static` | silencing/collecting OCCT messages; STEP unit/schema configuration (3 + 3 + 3 refs) |

### Non-blocking but required for a library-grade API

| # | Gap | Notes |
| --- | --- | --- |
| 35 | Replace every `panic!`/`unwrap`/`expect` listed in risk note (c) with typed errors | A Node addon must never abort the host process on bad input. |
| 36 | Add `Clone` (via `BRepBuilderAPI_Copy` or `*_to_owned`) to all shape wrappers | Nothing in the high-level crate is `Clone`. |
| 37 | Decide and document thread-safety | The blanket `unsafe impl Send` at `topo_ds.rs:118-124` is unjustified; Neon worker threads make this load-bearing. |
| 38 | Null-check every `Handle_*` deref in wrapper headers | Currently only two of them use `handle_try_deref`. |
| 39 | Expose full iterator coverage (`vertices`, `wires`, `shells`, `solids`, `compounds`) and `as_*` downcasts | `EdgeIterator`/`FaceIterator` are the only two. |
| 40 | Expose `Message_ProgressIndicator` for cancellation | Every call site currently constructs a throwaway empty `Message_ProgressRange`. |
| 41 | Replace deprecated `TopTools_*`/`TColgp_*` alias names with `NCollection_*` | Removes OCCT 8 deprecation warnings and future-proofs against their removal (risk note E3). |
| 42 | Finish the stubs | `Edge::ellipse()` (`edge.rs:98`), `Edge::tangent_arc()` (`edge.rs:170`), `Wire::freeform()` (`wire.rs:267`) are empty functions. |
| 43 | Investigate the `GeomAbs_Tangent` offset segfault | Disabled upstream with a `TODO` at `primitives.rs:243`; with `OCC_CONVERT_SIGNALS` undefined on macOS it is an unrecoverable crash. |

### Already solved in Caddy's vendored copy

For completeness, `packages/occt-native/vendor/opencascade-sys` already diverges from upstream in exactly four ways, all of them correct fixes for risk note (e):

- `Cargo.toml` adds `links = "opencascade"`;
- `build.rs` widens the version gate to `(version_major, version_minor) < OCCT_VERSION || version_major > OCCT_MAX_MAJOR` with `OCCT_MAX_MAJOR = 8`;
- `build.rs` switches `-std=c++11` → `-std=c++17` and emits `cargo:include`, `cargo:lib_dir`, `cargo:version`;
- `include/occt_compat.hxx` restores the 16 `Handle_<Class>` typedefs OCCT 8 removed.

None of the 34 blocking gaps above are addressed by those changes.
