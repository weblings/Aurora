# Shared helpers for the huenicorn check scripts (sourced, not run).

# Copy huenicorn's src/ and include/ from $ref (git archive) or the working
# tree into build/<name>-<ref>/tree; prints the build dir.
prepare_tree() {
  local tag="${ref:-worktree}"
  local dir="$here/build/$1-${tag//\//_}"
  rm -rf "$dir/tree"
  mkdir -p "$dir/tree"
  if [[ -n "$ref" ]]; then
    git -C "$src" archive "$ref" src include | tar -x -C "$dir/tree"
  else
    cp -r "$src/src" "$src/include" "$dir/tree/"
  fi
  echo "$dir"
}

# huenicorn's headers need nlohmann/json and glm. Sets dep_flags: nothing when
# a header is on the system path, else --deps-include, else the copy Aurora's
# own CMake build fetched into build/_deps.
find_dep_includes() {
  dep_flags=()
  [[ -n "${deps_include:-}" ]] && dep_flags=(-I "$deps_include")
  local header pattern found
  for header in nlohmann/json.hpp glm/exponential.hpp; do
    if echo "#include <$header>" | g++ -std=c++20 -fsyntax-only ${dep_flags[@]+"${dep_flags[@]}"} -x c++ - 2>/dev/null; then
      continue
    fi
    case "$header" in
      nlohmann/*) pattern='*nlohmann_json-src/single_include/nlohmann/json.hpp' ;;
      glm/*) pattern='*glm-src/glm/exponential.hpp' ;;
    esac
    found="$(find "$here/../../build" -path "$pattern" -print -quit 2>/dev/null || true)"
    if [[ -z "$found" ]]; then
      echo "$header not found: install it (nlohmann-json3-dev, libglm-dev) or pass --deps-include DIR" >&2
      exit 1
    fi
    dep_flags+=(-I "$(dirname "$(dirname "$found")")")
  done
}

# 0/1 come from the driver; anything else is a crash. Returns non-zero on a crash.
report_rc() {
  case "$1" in
    0|1) return 0 ;;
    *) echo "RESULT: crashed (exit $1$([[ $1 -gt 128 ]] && echo ", signal $(($1 - 128))" || true))"; return 1 ;;
  esac
}
