#pragma once

#include <optional>
#include <ostream>
#include <string_view>


namespace Aurora::App
{

  // Early-CLI handling: --help / --version / unknown-flag rejection
  // (Aurora-0gd, Aurora-v3in). Call as the first argv-touching step in
  // main() -- on Windows, right after attachParentConsole() so the printout
  // lands on a live console -- and return the exit code immediately when
  // one is returned: no InstanceLock, no --fresh wipe, no pipeline build,
  // no port bind, no tray.
  //
  // Same content in app/linux's, app/mac's and app/windows' copies of this
  // file -- three per-platform copies on purpose (matching FakeHue.hpp /
  // Registry.hpp / InstanceLock.hpp's existing convention here), not a
  // shared header, since each app/<platform> repo fetches independently.
  // Keep all three in sync by hand if this ever changes (Aurora-zx4). The
  // only platform difference is the call site: Windows passes
  // withConsoleFlag=true for its --console flag, Linux/Mac pass false.
  //
  // Contract: --help prints usage to `out`, exit 0; --version prints
  // "Aurora <version>" to `out`, exit 0 (--help wins if both are present,
  // and both win over unknown-argument errors); any other unrecognized
  // argument prints an error plus usage to `err`, exit 2; anything else
  // returns nullopt and the app boots normally. argv[0] is never matched.
  // Streams are parameters (main passes cout/cerr) so this stays
  // unit-testable with stringstreams and never touches the log sink.
  inline void printCliUsage(std::ostream& out, bool withConsoleFlag)
  {
    out << "Usage: Aurora [options]\n"
           "\n"
           "Options:\n"
           "  --fake-hue   Use fake Hue bridge defaults (dev flow)\n"
           "  --fresh      Start with a guaranteed-empty config root\n";
    if(withConsoleFlag){
      out << "  --console    Attach a console for log output\n";
    }
    out << "  --help       Print this usage and exit\n"
           "  --version    Print the version and exit\n";
  }

  inline std::optional<int> handleEarlyCli(
    int argc,
    char** argv,
    std::string_view version,
    bool withConsoleFlag,
    std::ostream& out,
    std::ostream& err)
  {
    auto hasFlag = [&](std::string_view flag){
      for(int i = 1; i < argc; ++i){
        if(argv[i] != nullptr && std::string_view(argv[i]) == flag){
          return true;
        }
      }
      return false;
    };

    if(hasFlag("--help")){
      printCliUsage(out, withConsoleFlag);
      return 0;
    }
    if(hasFlag("--version")){
      out << "Aurora " << version << "\n";
      return 0;
    }

    for(int i = 1; i < argc; ++i){
      const std::string_view arg = argv[i] != nullptr ? argv[i] : "";
      const bool known = arg == "--fake-hue" || arg == "--fresh"
        || (withConsoleFlag && arg == "--console");
      if(!known){
        err << "Unknown argument: " << arg << "\n";
        printCliUsage(err, withConsoleFlag);
        return 2;
      }
    }
    return std::nullopt;
  }

} // namespace Aurora::App
