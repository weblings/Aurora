# Run with -DEXE=<path> before the link. Windows refuses to overwrite a running
# exe but allows renaming it, so move it aside and let the link write a new one.
# An earlier .old copy may itself still run, so fall through to the next name.
if(EXISTS "${EXE}")
  string(REGEX REPLACE [[\.exe$]] "" BASE "${EXE}")
  foreach(N "" 2 3 4 5 6 7 8 9)
    set(OLD "${BASE}.old${N}.exe")
    execute_process(COMMAND ${CMAKE_COMMAND} -E remove -f "${OLD}" OUTPUT_QUIET ERROR_QUIET)
    execute_process(COMMAND ${CMAKE_COMMAND} -E rename "${EXE}" "${OLD}" RESULT_VARIABLE RENAMED OUTPUT_QUIET ERROR_QUIET)
    if(RENAMED EQUAL 0)
      break()
    endif()
  endforeach()
endif()
