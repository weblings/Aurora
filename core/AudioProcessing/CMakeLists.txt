# Aurora::AudioProcessing -- the audio-reactive default effect's logic
# (Analysis/AudioAnalysis.md). A separate target from AuroraProcessing
# deliberately: only audio-enabled consumers need this linked, matching the
# dependency-isolation reasoning behind the Input/Output plugin repo split.
#
# aubio installed with its default "tools" feature explicitly disabled
# (`aubio[core]`) -- that feature pulls in ffmpeg/libflac/libogg/libsndfile/
# libvorbis, which would silently widen Core's dependency-isolation
# exception (detection-only) into a full media-decode stack. Verified via
# a real install: [core] took 9.5s, the default feature would have needed
# building ffmpeg from source.
find_package(Aubio CONFIG REQUIRED)

add_library(AuroraAudioProcessing STATIC
  src/AudioProcessing.cpp
  src/AudioFeatureExtractor.cpp
)

target_include_directories(AuroraAudioProcessing PUBLIC
  ${CMAKE_CURRENT_SOURCE_DIR}/include
)

target_link_libraries(AuroraAudioProcessing PUBLIC
  AuroraContracts
  Aubio::aubio
)

target_compile_features(AuroraAudioProcessing PUBLIC cxx_std_20)
