**AI Video → Game-Ready Sprites**

Quick overview
- **What it does**: Extracts frames from a video, removes or masks the background, auto-crops and sizes frames, and exports game-ready PNG sprites (with alpha), a sprite sheet, or a ZIP of frames.
- **Front end**: Includes a Streamlit app (`streamlit_app.py`) to preview frames, pick chroma-key color, tune an ROI, remove halo, and export.

**Requirements**
- **OS**: Windows (desktop GUI recommended for ROI selection)
- **Python**: 3.8+
- **Installed packages**: See `requirements.txt` (installs `rembg`, `opencv-python`, `streamlit`, `streamlit-drawable-canvas`, etc.)

**Install**
Run in PowerShell inside the project folder:
```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

**Files**
- `video_to_sprites.py`: CLI that extracts frames (time range, ROI), calls `rembg` for background removal, and writes PNGs.
- `chroma_key.py`: Offline chroma-key fallback that converts PNGs to RGBA by removing a sampled background color.
- `streamlit_app.py`: Interactive frontend to load a folder or a video, sample frames, preview animation, pick/remove background, tune ROI, and export.

**Command-line usage**
- Extract frames with interactive ROI:
```powershell
python video_to_sprites.py -i "C:\path\to\input.mp4" -o "C:\path\to\output_sprites" --interactive-roi
```
- Extract a specific time range and ROI, saving every 2nd frame:
```powershell
python video_to_sprites.py -i ".\walk.mp4" -o ".\sprites" --start 0:02 --end 0:04.5 --roi 50,20,200,220 --step 2
```

**Streamlit app (recommended workflow)**
1. Start the app:
```powershell
streamlit run .\streamlit_app.py
```
2. In the app:
- Choose **Source Type**: `Video` (upload or local path) or `Folder` (pre-extracted PNGs).
- If `Video`: set `Start` / `End` times and `Sample every Nth frame`, then `Extract frames from video`.
- Use the thumbnail grid to select frames to export.
- Use the adaptive palette or color picker to set the chroma-key color. If `streamlit-drawable-canvas` is installed you can click the preview to sample a pixel color directly.
- Click **Auto-detect ROI** (chroma-based) and fine-tune the ROI sliders; choose `Animation Relative` or `Center-Center` crop mode.
- Optionally apply **Halo Remover** to clean edges.
- Export a sprite sheet or download a ZIP of PNG frames.

**Chroma-key fallback (offline)**
- If `rembg` is unavailable or too slow, run the included `chroma_key.py` on a folder of PNGs:
```powershell
python .\chroma_key.py -i "Videos\Output" -o "Videos\Output_transparent" --sample-corners --threshold 60
```

**Troubleshooting & Tips**
- `rembg` downloads model artifacts on first run — allow internet and a few minutes for the initial download.
- If `streamlit-drawable-canvas` fails to install, the Streamlit app still works — it falls back to palette and color picker for chroma-key.
- For best chroma-key results, use a uniform background (green/blue) or letterboxed border. If the background is complex, try `rembg` (neural matting) instead of chroma-key.
- Adjust `--step` or `Sample every Nth frame` to reduce the number of extracted frames (speed vs. coverage).
- Start with `Halo Remover = 2-5px`; increase if halos remain.

**Next steps / Improvements**
- Add tighter pixel-accurate click-to-pick color sampling via a custom Streamlit component.
- Add motion-based ROI detection (frame differencing) as a fallback for non-uniform backgrounds.
- Add automatic sprite-sheet packing (non-grid) and metadata JSON for engine import.

If you want, I can: run a demo extraction, add a sprite-sheet packer, or implement click-to-pick color sampling in the app.

Chroma-key fallback utility
- A simple offline chroma-key tool `chroma_key.py` is included to convert already-saved PNGs into transparent sprites when the background is fairly uniform.

Usage example (PowerShell):
```powershell
# Process all PNGs in-place (overwrites files):
python .\chroma_key.py -i "Videos\Output" --in-place --sample-corners --threshold 60

# Or write results to a new folder and specify an explicit background color (R,G,B):
python .\chroma_key.py -i "Videos\Output" -o "Videos\Output_transparent" --bgcolor 240,240,235 --threshold 50
```

Notes
- `--threshold` controls how tolerant the removal is; increase to remove more background but beware of removing similar-colored pixels in the subject.
- `--sample-corners` averages small patches at the four image corners to auto-detect a background color (useful for letterboxed frames).
