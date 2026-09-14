# Aurora::AudioProcessing -- the audio-reactive default effect's logic
# (Analysis/AudioAnalysis.md). A separate target from AuroraProcessing
# deliberately: only audio-enabled consumers need this linked, matching the
# dependency-isolation reasoning behind the Input/Output plugin repo split.
#
# Two different platform conventions, not one cross-platform answer --
# matches how X11/Pipewire already resolve on Linux (Aurora-Input-Linux)
# vs. how the rest of Windows' deps resolve via vcpkg.
if(WIN32)
  # aubio installed with its default "tools" feature explicitly disabled
  # (`aubio[core]`) -- that feature pulls in ffmpeg/libflac/libogg/libsndfile/
  # libvorbis, which would silently widen Core's dependency-isolation
  # exception (detection-only) into a full media-decode stack. Verified via
  # a real install: [core] took 9.5s, the default feature would have needed
  # building ffmpeg from source.
  find_package(Aubio CONFIG REQUIRED)
  set(AURORA_AUBIO_TARGET Aubio::aubio)
else()
  # No vcpkg convention on Linux -- apt's libaubio-dev ships a pkg-config
  # file (no CMake config), same resolution X11/Pipewire already use there.
  # No "tools"-feature concern either: it's a prebuilt system package, not
  # a from-source vcpkg port with optional features to disable.
  # Unverified on real hardware: confirm with `pkg-config --exists aubio`
  # (install via `sudo apt install libaubio-dev pkg-config` if missing).
  find_package(PkgConfig REQUIRED)
  pkg_check_modules(AUBIO REQUIRED IMPORTED_TARGET aubio)
  set(AURORA_AUBIO_TARGET PkgConfig::AUBIO)
endif()

add_library(AuroraAudioProcessing STATIC
  src/AudioProcessing.cpp
  src/AudioFeatureExtractor.cpp
)

target_include_directories(AuroraAudioProcessing PUBLIC
  ${CMAKE_CURRENT_SOURCE_DIR}/include
)

target_link_libraries(AuroraAudioProcessing PUBLIC
  AuroraContracts
  ${AURORA_AUBIO_TARGET}
)

target_compile_features(AuroraAudioProcessing PUBLIC cxx_std_20)
