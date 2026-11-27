#!/usr/bin/env bash
# usage: scripts/capture.sh [url]   → docs/demo-live.gif, docs/demo.mp4, docs/live-*.png
set -euo pipefail
URL=${1:-http://localhost:8090}
node scripts/capture.mjs "$URL"
# a crisp MP4 for the video edit
ffmpeg -y -loglevel error -i docs/.rec/demo.webm -c:v libx264 -pix_fmt yuv420p -crf 22 -movflags +faststart docs/demo.mp4
# a README-friendly GIF: sped up 1.3x, 10 fps, 900 px wide, capped at 22 s
ffmpeg -y -loglevel error -i docs/.rec/demo.webm -t 29 \
  -vf "setpts=PTS/1.3,fps=10,scale=900:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4" \
  docs/demo-live.gif
ls -lh docs/demo-live.gif docs/demo.mp4 docs/live-*.png
