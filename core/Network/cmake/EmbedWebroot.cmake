# aurora_embed_webroot(<output-header> <input-dir>
#                      [NAMESPACE <ns>] [DEPENDS <file-or-target-output>...])
#
# Generates a C++ header defining Aurora::EmbeddedWebRoot::files from every
# file under <input-dir> (keys are webroot-relative forward-slash paths),
# via core/Network/tools/embed_webroot.py. The header regenerates whenever
# any input file is added, removed, or changed (CONFIGURE_DEPENDS re-globs
# at configure time; the custom command DEPENDS on the glob result).
#
# Consumers (app/linux, app/windows) call this with their fetched web/ui
# dir, add the header to the app target, and pass the map to
# HttpServer::serveEmbeddedFiles() as the last probe-order fallback
# (env override > baked source dir > embedded). Core itself never calls
# this -- AuroraNetwork stays free of any web/ui dependency.
#
# NAMESPACE names the map's namespace under Aurora (default EmbeddedWebRoot),
# so one target can embed several maps. DEPENDS adds extra build-time inputs:
# an input dir produced by another build step (the graph editor's vite
# output, Aurora-lzj) doesn't exist at configure time, so the glob can't
# track it and the caller passes that step's stamp file instead.
function(aurora_embed_webroot OUTPUT_HEADER INPUT_DIR)
  cmake_parse_arguments(PARSE_ARGV 2 _AEW "" "NAMESPACE" "DEPENDS")
  find_package(Python3 REQUIRED COMPONENTS Interpreter)

  file(GLOB_RECURSE _AURORA_WEBROOT_FILES CONFIGURE_DEPENDS "${INPUT_DIR}/*")

  add_custom_command(
    OUTPUT "${OUTPUT_HEADER}"
    COMMAND Python3::Interpreter
      "${CMAKE_CURRENT_FUNCTION_LIST_DIR}/../tools/embed_webroot.py"
      "${INPUT_DIR}"
      "${OUTPUT_HEADER}"
      ${_AEW_NAMESPACE}
    DEPENDS ${_AURORA_WEBROOT_FILES} ${_AEW_DEPENDS}
      "${CMAKE_CURRENT_FUNCTION_LIST_DIR}/../tools/embed_webroot.py"
    COMMENT "Embedding webroot ${INPUT_DIR} into ${OUTPUT_HEADER}"
    VERBATIM
  )
endfunction()
