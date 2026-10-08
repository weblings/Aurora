#!/usr/bin/env python3
"""Write the webroot fixture EmbedWebrootTests round-trips (Aurora-lzj).

Usage: make_embed_fixture.py <output-dir>

Covers what has broken or could break embed_webroot.py output: every byte
value, \\xNN followed by hex digits, NULs, trigraph sequences, printable runs
past MSVC's 16380-char literal cap, a file far past the ~64 KB concatenated
cap, files on and just past the 60000-byte segment edge, an empty file, and
nested directories.
"""
import os
import shutil
import sys


def pattern(size: int) -> bytes:
    block = (b'const a = b ??! c ??= d; "q" \\ \'s\'\r\n\t'
             + bytes(range(256)) + b'deadbeef\x0afeed\x00\x00')
    return (block * (size // len(block) + 1))[:size]


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: make_embed_fixture.py <output-dir>", file=sys.stderr)
        return 2

    out = sys.argv[1]
    shutil.rmtree(out, ignore_errors=True)
    files = {
        "big.js": pattern(400000),
        "run.txt": b"a" * 70000,
        "edge-60000.bin": pattern(60000),
        "edge-60001.bin": pattern(60001),
        "empty.txt": b"",
        "sub/dir/index.html": b"<html>nested</html>",
    }
    for name, data in files.items():
        path = os.path.join(out, *name.split("/"))
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "wb") as handle:
            handle.write(data)
    return 0


if __name__ == "__main__":
    sys.exit(main())
