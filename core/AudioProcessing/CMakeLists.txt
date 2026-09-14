# Aurora::AudioProcessing -- the audio-reactive default effect's logic
# (Analysis/AudioAnalysis.md). A separate target from AuroraProcessing
# deliberately: only audio-enabled consumers need this linked, matching the
# dependency-isolation reasoning behind the Input/Output plugin repo split.
# No aubio dependency yet -- extractFeatures()'s onset/centroid pieces are
# placeholders until aubio's real C API is verified (see the header comment).

add_library(AuroraAudioProcessing STATIC
  src/AudioProcessing.cpp
)

target_include_directories(AuroraAudioProcessing PUBLIC
  ${CMAKE_CURRENT_SOURCE_DIR}/include
)

target_link_libraries(AuroraAudioProcessing PUBLIC
  AuroraContracts
)

target_compile_features(AuroraAudioProcessing PUBLIC cxx_std_20)
