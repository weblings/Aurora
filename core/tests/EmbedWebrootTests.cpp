#include <filesystem>
#include <fstream>
#include <sstream>

#include <catch2/catch_test_macros.hpp>

#include "EmbedFixture.hpp"


namespace
{
  std::string readFile(const std::filesystem::path& path)
  {
    std::ifstream file(path, std::ios::binary);
    std::stringstream contents;
    contents << file.rdbuf();
    return contents.str();
  }
}


// Aurora-lzj: compiled round-trip over every fixture file (lesson: a text-only
// spot check passes while binaries corrupt). The first MSVC build of this
// target is the real check on the concatenated-literal cap.
TEST_CASE("embed_webroot.py round-trips every fixture file byte-identically", "[EmbedWebroot]")
{
  const std::filesystem::path root = AURORA_EMBED_FIXTURE_DIR;
  const auto& files = Aurora::EmbedFixture::files;

  std::size_t onDisk = 0;
  for(const auto& entry : std::filesystem::recursive_directory_iterator(root)){
    if(!entry.is_regular_file()){
      continue;
    }
    ++onDisk;

    const auto key = std::filesystem::relative(entry.path(), root).generic_string();
    INFO(key);
    auto it = files.find(key);
    REQUIRE(it != files.end());
    CHECK(it->second == readFile(entry.path()));
  }

  CHECK(files.size() == onDisk);
  REQUIRE(files.count("big.js") == 1);
  CHECK(files.at("big.js").size() == 400000);
  CHECK(files.at("empty.txt").empty());
}
