#!/bin/bash
# convert.sh — Convert PDFs to PNGs and regenerate items.json manifest
#
# Usage:
#   cd cuantieval/
#   bash convert.sh
#
# This script:
#  1. Converts each .pdf in imgs/ to PNG(s) at 150 DPI using pdftoppm
#  2. Downscales PNGs wider than 1600px to 1600px max width
#  3. Keeps original PDFs for the "Descargar" button
#  4. Generates/refreshes items.json with metadata
#
# Requirements:
#  - pdftoppm (from poppler-utils)
#  - pngquant (optional, for compression)

set -e

IMGS_DIR="imgs"
MANIFEST="items.json"
DPI=150
MAX_WIDTH=1600

echo "=== Cuantieval: PDF → PNG Conversion ==="
echo ""

# Check for required tools
if ! command -v pdftoppm &> /dev/null; then
  echo "ERROR: pdftoppm not found. Install poppler-utils:"
  echo "  macOS:   brew install poppler"
  echo "  Ubuntu:  apt install poppler-utils"
  exit 1
fi

# Create or clear a temp manifest
TEMP_MANIFEST=$(mktemp)
cat > "$TEMP_MANIFEST" << 'EOF'
[
EOF

first_entry=true

# Known instrument labels
declare -A LABELS=(
  [audit]="AUDIT"
  [16pf]="16PF"
  [htp]="HTP"
  [mbi]="MBI (Burnout)"
  [mini]="MINI"
  [moca]="MoCA"
  [pclr]="PCL-R"
  [pclyv]="PCL:YV"
  [ro]="Rorschach"
  [tat]="TAT"
)

# Process each PDF in imgs/
echo "Converting PDFs..."
for pdf in "$IMGS_DIR"/*.pdf; do
  [ ! -f "$pdf" ] && continue

  base=$(basename "$pdf" .pdf)
  echo "  Processing: $base.pdf"

  # Convert PDF to PNG(s) at specified DPI
  pdftoppm -png -r $DPI "$pdf" "$IMGS_DIR/$base"

  # Get list of generated PNGs for this PDF
  pngs=()
  for png in "$IMGS_DIR/${base}-"*.png; do
    [ ! -f "$png" ] && continue

    # Downscale if needed
    if command -v identify &> /dev/null; then
      width=$(identify -format "%w" "$png" 2>/dev/null || echo 0)
      if [ "$width" -gt "$MAX_WIDTH" ]; then
        echo "    Downscaling: $(basename "$png") ($width → ${MAX_WIDTH}px)"
        if command -v mogrify &> /dev/null; then
          mogrify -resize "${MAX_WIDTH}x>" "$png"
        fi
      fi
    fi

    # Optional: compress with pngquant
    if command -v pngquant &> /dev/null && [ -f "$png" ]; then
      pngquant --force --output "${png}.tmp" 256 "$png" 2>/dev/null && mv "${png}.tmp" "$png" || true
    fi

    pngs+=("$(basename "$png")")
  done

  # Determine label from base name or use custom
  label="${LABELS[$base]:-$(echo $base | tr '_' ' ' | sed 's/^./\U&/')}"

  # Add to manifest JSON
  files_json=$(printf '%s\n' "${pngs[@]}" | jq -R '"imgs/" + .' | jq -s .)

  if [ "$first_entry" = false ]; then
    echo "  ," >> "$TEMP_MANIFEST"
  fi
  first_entry=false

  cat >> "$TEMP_MANIFEST" << ENTRY
  { "id": "$base", "label": "$label", "files": $files_json, "pdf": "imgs/$base.pdf", "status": "ok" }
ENTRY

  echo "    ✓ $(echo ${pngs[@]} | wc -w) PNG(s) created"
done

echo ""

# Add placeholder entries for missing groups (if fewer than 12 items)
echo "Checking for placeholder groups..."
entry_count=$(jq 'length' "$MANIFEST" 2>/dev/null || echo 0)

if [ "$entry_count" -lt 12 ]; then
  for i in $(seq 1 12); do
    id="grupo$i"
    label="Grupo $i"

    # Check if already in manifest
    if ! jq -e ".[] | select(.id == \"$id\")" "$MANIFEST" &>/dev/null 2>&1; then
      if [ "$first_entry" = false ]; then
        echo "  ," >> "$TEMP_MANIFEST"
      fi
      first_entry=false

      cat >> "$TEMP_MANIFEST" << ENTRY
  { "id": "$id", "label": "$label", "files": [], "pdf": null, "status": "missing" }
ENTRY

      echo "  Added placeholder: $id"
    fi
  done
fi

# Close JSON array
echo "" >> "$TEMP_MANIFEST"
echo "]" >> "$TEMP_MANIFEST"

# Validate and replace manifest
if jq empty "$TEMP_MANIFEST" 2>/dev/null; then
  mv "$TEMP_MANIFEST" "$MANIFEST"
  echo ""
  echo "✓ Manifest updated: $MANIFEST"
  echo "  Total items: $(jq 'length' "$MANIFEST")"
else
  echo "ERROR: Invalid JSON in manifest"
  rm "$TEMP_MANIFEST"
  exit 1
fi

echo ""
echo "=== Conversion Complete ==="
echo ""
echo "Next steps:"
echo "  1. Review $MANIFEST — edit labels/IDs as needed"
echo "  2. Commit: git add cuantieval/"
echo "  3. Test: Open https://lamp-umag.github.io/sssss/cuantieval/ in a phone browser"
