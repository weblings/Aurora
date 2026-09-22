<p align="center">
  <img src="docs/README/Logo_Full_Dark.png" alt="Aurora" />
</p>

# Aurora

- A modular, multiplatform processor of inputs to generate outputs. Today that's video / audio to Hue light colors.
- Runs entirely on your machine — your screen, audio, and settings never leave your computer or local network
- Aurora's capture math, Hue streaming wire format, and many UI elements were distilled from [Huenicorn](https://gitlab.com/openjowelsofts/huenicorn) into discrete modules

**[Try the GitHub pages demo](https://weblings.github.io/Aurora/index.html)** - Uses an example 3D room so no real Hue lights needed

## Quick Start

- You need a Philips Hue bridge with registered lamps, and an entertainment area defined through
Philips' official app.
- Locate the latest [GitHub Release](https://github.com/weblings/Aurora/releases) and download the zip for your platform. Keep the contents of the folder together so the app can work correctly.
- (Read dependencies before this step) In a terminal window in the unzipped folder, launch the app. Ctrl + click on the link to open the UI and get setup. Enjoy!
- Dependencies:
  - **Windows:** Try launching Aurora. If you get an error saying "The code execution cannot proceed because VCRUNTIME140.dll was not found", then you need: [Visual C++ Redistributable](https://learn.microsoft.com/en-us/cpp/windows/latest-supported-vc-redist). If not, it's already installed and you're good to go.
  - **Linux (Debian/Ubuntu):** `sudo apt install libx11-6 libxext6 libxrandr2 pipewire libaubio5 libcurl4t64 libopencv-core410 libmbedtls21` (ffmpeg and GL pieces arrive automatically as dependencies of those; on older releases the curl/opencv/mbedtls package names differ slightly, and a missing-`.so` error on launch names its package).

## Layout

One repo, with a directory per slice. You only build the ones for your platform:

- [`core/`](core) — capture/processing/output contracts, pipelines, orchestration
- [`app/windows`](app/windows) / [`app/linux`](app/linux) — the runnable apps; **start here to use Aurora**
- [`input/windows`](input/windows) / [`input/linux`](input/linux) — screen + audio capture plugins (DXGI on Windows; X11 / Wayland-Pipewire on Linux)
- [`output/hue`](output/hue) — Philips Hue entertainment-streaming output plugin
- [`web/ui`](web/ui) — the setup/control interface the apps serve in your browser

**Prebuilt binaries:** from the 1.0.1 GitHub Release above. To compile from source instead, see below.

## For Developers

To build from source or contribute, clone `git clone https://github.com/weblings/Aurora.git` and see
[docs/Building.md](docs/Building.md) (all platforms, presets, install trees) and
[CONTRIBUTING.md](CONTRIBUTING.md) (tasks, version rules, test gates).

```
content --> Input --> Processing --> Output --> bulbs
(screen,      |           |             |
 audio,      DXGI /      color +       Hue
 video)      X11 /       effect
             PipeWire    pipeline
```

Input, Processing, and Output are built to be swappable modules: write your own Input (capture source),
Processing (source to effects handling), or Output (color / effects) module

- Full task history lives in beads (`.beads/` is committed, so it ships with the clone):
  install the [`bd` CLI](https://github.com/steveyegge/beads), then `bd list` / `bd show <id>`
  from the repo root — closed tasks carry the context behind these docs.
- Each slice's README covers its own status, build flags, and tests;
  `ctest --test-dir build/linux-app` (or `build/windows-app`) runs the full native suite.
- `docs/` holds the distillation notes (capture, Hue output, browser strategy), lessons, and build history.

## Troubleshooting

**I'm not seeing audio reacting**
- If no audio was actively playing before you toggled to audio the grabber might have trouble finding it. Switch back to video, play some audio, then try switching to audio.

**I'm seeing some latency before UI loads on Linux**
- This is a tracked bug. Fixes should be landing in 1.0.2

## Art
- The aurora SVG in the logo is modified from <a href="https://www.vecteezy.com/vector-art/88906-free-northern-lights-vector-series"> Kaitlyn Parker's Northern Lights Series</a> on <a href="https://www.vecteezy.com/free-vector/nature">Nature Vectors by Vecteezy</a>
- Power icon from <a href="https://github.com/32pixelsCo/zest-icons/blob/master/packages/zest-free/LICENSE.md?ref=svgrepo.com" target="_blank">Zest</a> in MIT License via <a href="https://www.svgrepo.com/" target="_blank">SVG Repo</a>
- Other icon svgs are from <a href="https://vidstack.io/icons/?lib=react">Vidstack</a>
- For demo assets see: <a href="./web/demo/README.md">its README</a>

## License

Aurora is licensed under the [GNU General Public License v3.0 or later](LICENSE) — same as Huenicorn, which its logic is distilled from.

- [Huenicorn](https://gitlab.com/openjowelsofts/huenicorn) by OpenJowel is a free Philips Hue screen
synchronizer for GNU/Linux. Huenicorn was the reason I started exploring Linux again years ago, thank you OpenJowel!
- [RockyRoad](https://github.com/weblings/RockyRoad) by me is a web browser note-highway music app for guitar and piano with full support for WebXR-capable headsets. I repurposed a lot of the design tokens and components I built out there for this project.

## Intent and AI Disclaimer

- This repo is vibecoded. One project goal was to experiment with using AI to translate my past decade of Unity and XR coding knowledge to native Windows and Linux apps in C++.
- I've found the 1P Hue apps on various platforms unreliable over the years. Huenicorn has been a breath of fresh air! I was curious to see if I could extend some of the work its done.
- Long-term I'd like to extend this framework to handle inputs beyond media and drive outpts beyond colors. We'll see 

