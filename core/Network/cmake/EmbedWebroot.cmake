# aurora_embed_webroot(<output-header> <input-dir>)
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
function(aurora_embed_webroot OUTPUT_HEADER INPUT_DIR)
  find_package(Python3 REQUIRED COMPONENTS Interpreter)

  file(GLOB_RECURSE _AURORA_WEBROOT_FILES CONFIGURE_DEPENDS "${INPUT_DIR}/*")

  add_custom_command(
    OUTPUT "${OUTPUT_HEADER}"
    COMMAND Python3::Interpreter
      "${CMAKE_CURRENT_FUNCTION_LIST_DIR}/../tools/embed_webroot.py"
      "${INPUT_DIR}"
      "${OUTPUT_HEADER}"
    DEPENDS ${_AURORA_WEBROOT_FILES}
      "${CMAKE_CURRENT_FUNCTION_LIST_DIR}/../tools/embed_webroot.py"
    COMMENT "Embedding webroot ${INPUT_DIR} into ${OUTPUT_HEADER}"
    VERBATIM
  )
endfunction()
