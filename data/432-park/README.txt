432 PARK AVENUE - LIGHTWEIGHT GLB MODELS AND ROOM DATA
Architect: Rafael Vinoly Architects
Created 14 November 2026

FILES
432_Park_Avenue_Lightweight.glb
  Complete approximate 425.5 m tower with its six-bay square window grid,
  five open mechanical bands, fixed central core, and 54 generated
  residential floor layouts. The model uses 86 sequential visualization
  levels, including four double-height lower amenity levels. The indices
  Model_Level_001, etc. are visualization IDs, not actual marketing floor
  numbers. Mechanical-band locations and the level schedule are approximate.

432_Park_Avenue_Typical_Plans.glb
  Four simplified source-based archetypes: one, two, three and four
  apartments per floor. They are arranged side by side for inspection.
  They use the same fixed central shaft/core geometry as the tower.

432_Park_Avenue_Metadata.json
  Human-readable building, file, floor, and room records for both assets,
  including source links and model assumptions.

432_Park_Avenue_Rooms.csv
  Flat room table for both assets, suitable for spreadsheets or scripts.

432_Park_Avenue_Preview.png
  Rendered views of the exported models, with window glass omitted in the
  typical-plan views to make the interiors easier to inspect.

EMBEDDED METADATA
  Room properties are stored in each room node's standard glTF extras.
  Each room node has a selectable floor-surface mesh. GLB viewers vary in
  whether they expose extras in their user interface. The JSON and CSV
  retain the room data independently of the viewer.

  room_id: unique model room identifier
  floor_id: parent model-level identifier
  unit_id: model apartment identifier
  room_type: function based on diagram labels or a flagged inference
  model_area_m2: area of the reconstructed room polygon
  clear_height_m: nominal finished height, 3.81 m
  estimated_volume_m3: modeled area multiplied by nominal clear height
  layout_id: the source typology used for the layout
  prototype_room_id: matching room in the archetype
  is_generated / layout_origin: source-diagram reconstruction or generated
  type_assignment: how the room function was assigned
  area_status: precision and interpretation of the area
  source_id: lookup key into the sources array
  generation_seed: reproducible seed (432) for generated tower floors
  centroid_gltf_m / bounds_gltf_m: room position and envelope in GLB axes

  Floor nodes also carry the layout, apartment count, room count,
  model-level index, generated status and floor-area summary. The scene
  carries the building name, architect, source URLs and assumptions.

ROOM DATA COVERAGE
  Typical-plan asset: 83 reconstructed room polygons.
  Tower asset: 1,095 room records across 54 generated residential layouts.
  Lobby, building-service and open mechanical levels have program metadata
  and a representative core; individual ancillary rooms on those levels
  are outside the room-data coverage.

SOURCED AND GENERATED CONTENT
  The four one-/two-/three-/four-apartment diagrams in the supplied ArchEyes
  article are the basis of the partition layouts. Wall footprints were
  simplified from their dark plan graphics. Doorway gaps were closed to
  estimate room boundaries; room types use diagram labels and positions.
  Uncertain functions are marked with type_assignment, and some spaces
  retain generic Room or Ancillary room types.

  The full tower uses deterministic weighted random choices of typology,
  quarter-turn orientation and three simple furniture variants. Higher
  residential bands are weighted toward larger apartments. The core and
  exterior grid stay fixed. Room IDs and apartment IDs identify this model.
  The generated floor assignments do not represent actual apartments.

  Nominal dimensions: width 28.5 m; height 425.5 m; typical floor-to-floor
  4.7244 m (15 ft 6 in); finished ceiling 3.81 m (12 ft 6 in); square windows
  3.048 m (10 ft) each side; typical slab 0.254 m (10 in).

  This is an independent approximate architectural study. Model areas and
  volumes are estimates derived from reconstructed polygons, and should
  not be interpreted as surveyed or certified property measurements.
  Finishes, furniture, room closure lines, amenity floors, mechanical-band
  elevations and roof details are illustrative.

LIGHTWEIGHT STRUCTURE
  No photographic textures or external dependencies are embedded in the
  GLBs. Standard glTF mesh references reuse archetypes, room surfaces,
  stair/core meshes and facade modules across the tower. No proprietary
  compression or instancing extension is required to load the files.
  Opaque materials use a shared matte material and vertex colours.

SOURCES
  ArchEyes_RVA_typical_diagrams
  https://archeyes.com/432-park-avenue-by-rafael-vinoly-minimalism-in-the-new-york-skyline/
  Used for: Typical one-, two-, three- and four-unit layout diagrams credited to Rafael Vinoly Architects

  RVA_project
  https://vinoly.com/works/432-park-avenue/
  Used for: 425.5 m height, square tower, central core, 54 residential floors and nominal 812 m2 floorplate

  SLCE_project
  https://www.slcearch.com/project/432-park-avenue/
  Used for: 15.5 ft typical floor-to-floor and ten-foot square windows

  WSP_engineer
  https://www.structuremag.org/article/432-park/
  Used for: 93.5 ft square footprint, white concrete frame, 10 in typical slabs and five two-story open mechanical bands

REBUILDING
  Install requirements.txt and run:
    python build_432_park.py
  The included typical_plans.json supplies the geometry, so source images
  are not needed for a rebuild. The output is written to deliverables/.
  Change SEED in build_432_park.py to create another generated arrangement.
  The extraction and validation/render scripts are included for reference.
  Reference drawings and photography are not redistributed in this package.
