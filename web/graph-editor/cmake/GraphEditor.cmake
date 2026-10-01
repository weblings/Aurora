# Graph editor build (Aurora-lzj): builds web/graph-editor with npm/Vite and
# embeds the bundle into the C++ binary as Aurora::GraphEditorWebRoot::files,
# served by the apps under /graph-editor/.
#
# Opt-in: AURORA_ENABLE_GRAPH_EDITOR is OFF by default, so a default build
# needs no Node and produces the same embedded webroot as before. This file
# declares the option so every consumer (root superbuild, each app slice
# configured standalone) sees one definition.
#
#   AURORA_ENABLE_GRAPH_EDITOR  ON: build + embed the editor (needs Node >= 22.12)
#   AURORA_GRAPH_EDITOR_DIST    <dir>: embed this prebuilt bundle and skip npm
#                               entirely (offline/Flatpak builds that cannot
#                               run `npm ci`)
#
# The bundle is written to the build dir, never under web/ui/ (whose files
# aurora_embed_webroot collects for the main webroot).
option(AURORA_ENABLE_GRAPH_EDITOR "Build and embed the graph editor (needs Node >= 22.12; see docs/Building.md)" OFF)
set(AURORA_GRAPH_EDITOR_DIST "" CACHE PATH "Prebuilt graph editor bundle to embed instead of running npm")

include("${CMAKE_CURRENT_LIST_DIR}/../../../core/Network/cmake/EmbedWebroot.cmake")

# aurora_graph_editor_embed(<output-header>)
#
# Writes <output-header> defining Aurora::GraphEditorWebRoot::files and sets
# AURORA_GRAPH_EDITOR_NOTICE in the caller's scope to the generated
# THIRD-PARTY-NOTICES.md path (for install()/bundling).
function(aurora_graph_editor_embed OUTPUT_HEADER)
  get_filename_component(_editor_dir "${CMAKE_CURRENT_FUNCTION_LIST_DIR}/.." ABSOLUTE)

  if(AURORA_GRAPH_EDITOR_DIST)
    set(_dist "${AURORA_GRAPH_EDITOR_DIST}")
    set(_build_stamp "")
    message(STATUS "Graph editor: embedding prebuilt bundle ${_dist} (npm skipped)")
  else()
    # npm.cmd first: on Windows a bare `npm` is a shell script CreateProcess
    # cannot run.
    find_program(AURORA_NPM NAMES npm.cmd npm)
    if(NOT AURORA_NPM)
      message(FATAL_ERROR
        "AURORA_ENABLE_GRAPH_EDITOR is ON but npm was not found. Install "
        "Node >= 22.12 (see docs/Building.md), or set "
        "AURORA_GRAPH_EDITOR_DIST to a prebuilt bundle, or leave the option OFF.")
    endif()

    set(_dist "${CMAKE_CURRENT_BINARY_DIR}/graph-editor-dist")
    set(_install_stamp "${CMAKE_CURRENT_BINARY_DIR}/graph-editor-npm-ci.stamp")
    set(_build_stamp "${CMAKE_CURRENT_BINARY_DIR}/graph-editor-build.stamp")

    # Plain `npm ci`, no hardcoded network/cache flags: npm_config_* env vars
    # still apply, which is how an offline build points at a local cache.
    # .npmrc (ignore-scripts, engine-strict) comes from the project dir.
    add_custom_command(
      OUTPUT "${_install_stamp}"
      COMMAND "${AURORA_NPM}" ci
      COMMAND "${CMAKE_COMMAND}" -E touch "${_install_stamp}"
      WORKING_DIRECTORY "${_editor_dir}"
      DEPENDS "${_editor_dir}/package-lock.json" "${_editor_dir}/package.json"
      COMMENT "Graph editor: npm ci"
      VERBATIM
    )

    file(GLOB_RECURSE _editor_sources CONFIGURE_DEPENDS
      "${_editor_dir}/src/*" "${_editor_dir}/public/*")
    # --emptyOutDir: Vite refuses to empty an outDir outside its project, so
    # without it every rebuild leaves the old hashed bundles behind and the
    # embed step would ship all of them.
    add_custom_command(
      OUTPUT "${_build_stamp}"
      COMMAND "${AURORA_NPM}" run build -- --outDir "${_dist}" --emptyOutDir
      COMMAND "${CMAKE_COMMAND}" -E touch "${_build_stamp}"
      WORKING_DIRECTORY "${_editor_dir}"
      DEPENDS "${_install_stamp}" ${_editor_sources}
        "${_editor_dir}/index.html" "${_editor_dir}/vite.config.ts"
        "${_editor_dir}/tsconfig.json"
      COMMENT "Graph editor: vite build"
      VERBATIM
    )
  endif()

  # The dist dir doesn't exist at configure time, so the embed step depends on
  # the build stamp rather than on a configure-time glob of the output.
  aurora_embed_webroot("${OUTPUT_HEADER}" "${_dist}"
    NAMESPACE GraphEditorWebRoot
    DEPENDS ${_build_stamp})

  set(AURORA_GRAPH_EDITOR_NOTICE "${_dist}/THIRD-PARTY-NOTICES.md" PARENT_SCOPE)
endfunction()
