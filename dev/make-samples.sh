#!/usr/bin/env bash
# Makes the sample album used by dev/seed-immich.mjs and the e2e tests:
# 12 photos with camera EXIF (p1.jpg … p12.jpg) and a 4-second video (v1.mp4).
# Needs ImageMagick, exiftool and ffmpeg. Usage: dev/make-samples.sh <dir>
set -euo pipefail
dir=${1:?usage: dev/make-samples.sh <dir>}
mkdir -p "$dir"
magick=$(command -v magick || command -v convert) # ImageMagick 7 or 6
colors=(
	'#f4a261-#264653' '#e9c46a-#2a9d8f' '#e76f51-#264653' '#a8dadc-#1d3557' '#ffb4a2-#6d6875' '#90be6d-#277da1'
	'#f9c74f-#577590' '#cdb4db-#5e548e' '#ffd6a5-#9a8c98' '#bde0fe-#3d5a80' '#f6bd60-#84a59d' '#d8e2dc-#6d597a'
)
for i in $(seq 1 12); do
	if (( i % 3 == 0 )); then size=900x1350; else size=1500x1000; fi
	"$magick" -size "$size" "gradient:${colors[$((i - 1))]}" \( -size "$size" plasma:fractal -seed "$i" -blur 0x8 \) \
		-compose overlay -composite -quality 88 "$dir/p$i.jpg"
	day=$(printf %02d $((10 + i / 4)))
	hour=$(printf %02d $((9 + i)))
	exiftool -q -overwrite_original "-DateTimeOriginal=2026:08:$day $hour:1$((i % 6)):00" \
		-Make=Fujifilm -Model=X100VI -FNumber=2.8 -ExposureTime=1/250 -ISO=200 -FocalLength=23 "$dir/p$i.jpg"
done
ffmpeg -loglevel error -y -f lavfi -i "testsrc2=size=1280x720:rate=30" -t 4 -c:v libx264 -pix_fmt yuv420p \
	-movflags +faststart "$dir/v1.mp4"
echo "Samples written to $dir"
