import io
import zipfile
from pathlib import Path
from typing import List, Tuple, Optional

import streamlit as st
import imageio
import numpy as np
from PIL import Image, ImageFilter
import base64
from PIL import ImageDraw

# Local utilities
from video_to_sprites import parse_time
from chroma_key import make_alpha_by_chroma, sample_background_from_corners

# Monkey-patch for streamlit-drawable-canvas compatibility with Streamlit 1.30+
import streamlit.elements.image as st_image
# Monkey-patch for streamlit-drawable-canvas compatibility with Streamlit 1.30+
import sys
import streamlit.elements.image as st_image
try:
    from streamlit.elements.lib.image_utils import image_to_url as real_image_to_url
    
    class MockLayoutConfig:
        def __init__(self, width):
            self.width = width

    def image_to_url_wrapper(image, width, clamp, channels, output_format="PNG", image_id=""):
        # Map old arguments to new signature: 
        # (image, layout_config, image_format, image_id)
        # print(f"DEBUG: Wrapper called with: width={width}, fmt={output_format}, id={image_id}")
        config = MockLayoutConfig(width)
        return real_image_to_url(image, config, output_format, image_id)

    # Apply patch to module
    st_image.image_to_url = image_to_url_wrapper
    # Ensure it's patched in sys.modules to affect other imports
    if 'streamlit.elements.image' in sys.modules:
        sys.modules['streamlit.elements.image'].image_to_url = image_to_url_wrapper
    print("DEBUG: Applied image_to_url monkey-patch successfully.")
except ImportError as e:
    print(f"DEBUG: Failed to apply monkey-patch: {e}")
    pass

# optional canvas component for clickable color-pick
try:
    from streamlit_drawable_canvas import st_canvas
    HAS_CANVAS = True
except Exception:
    HAS_CANVAS = False


def extract_frames_from_video(path: str, start_s: float, end_s: Optional[float], step: int) -> Tuple[List[Image.Image], float]:
    reader = imageio.get_reader(path)
    meta = reader.get_meta_data()
    fps = float(meta.get("fps", 30.0))
    raw_nframes = meta.get("nframes")
    if raw_nframes is None or raw_nframes == float('inf'):
        total_frames = 0
    else:
        total_frames = int(raw_nframes)
    
    start_frame = int(start_s * fps) if start_s else 0
    end_frame = int(end_s * fps) if end_s is not None else (total_frames - 1 if total_frames > 0 else None)
    frames: List[Image.Image] = []
    i = 0
    for idx, frame in enumerate(reader):
        if idx < start_frame:
            continue
        if end_frame is not None and idx > end_frame:
            break
        if (idx - start_frame) % step != 0:
            continue
        img = Image.fromarray(frame).convert("RGBA")
        frames.append(img)
        i += 1
    try:
        reader.close()
    except Exception:
        pass
    return frames, fps


def detect_roi_by_chroma(frames: List[Image.Image], tol: float = 20.0) -> Optional[Tuple[int, int, int, int]]:
    if not frames:
        return None
    # sample background color from corners of first frame
    bg = sample_background_from_corners(frames[0])
    union_bbox = None
    for f in frames:
        alpha_img = make_alpha_by_chroma(f, bg, tol)
        b = bbox_from_alpha(alpha_img)
        if b is None:
            continue
        if union_bbox is None:
            union_bbox = b
        else:
            x1 = min(union_bbox[0], b[0])
            y1 = min(union_bbox[1], b[1])
            x2 = max(union_bbox[2], b[2])
            y2 = max(union_bbox[3], b[3])
            union_bbox = (x1, y1, x2, y2)
    return union_bbox


st.set_page_config(page_title="AI Character → Sprite", layout="wide")

# Helpers
import io
import zipfile
from math import ceil
from pathlib import Path
from typing import List, Tuple, Optional

import streamlit as st
import imageio
import numpy as np
from PIL import Image, ImageFilter

# Local utilities
from video_to_sprites import parse_time
from chroma_key import make_alpha_by_chroma, sample_background_from_corners


st.set_page_config(page_title="AI Character → Sprite", layout="wide")


# ------- Helpers -------
def load_pngs(folder: Path) -> List[Path]:
    return sorted(folder.glob("*.png"))


def pil_to_bytes(img: Image.Image) -> bytes:
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def make_spritesheet(images: List[Image.Image], tile_w: int, tile_h: int, cols: int) -> Image.Image:
    rows = (len(images) + cols - 1) // cols
    out = Image.new("RGBA", (cols * tile_w, rows * tile_h), (0, 0, 0, 0))
    for idx, img in enumerate(images):
        r = idx // cols
        c = idx % cols
        img_resized = img.resize((tile_w, tile_h), Image.LANCZOS)
        out.paste(img_resized, (c * tile_w, r * tile_h), img_resized)
    return out


def halo_remove(img: Image.Image, erode_px: int) -> Image.Image:
    if erode_px <= 0:
        return img
    arr = np.array(img.convert("RGBA"))
    alpha = arr[..., 3]
    pil_alpha = Image.fromarray(alpha)
    # Erosion to remove halo
    # size=3 means 1px radius, size=5 means 2px radius, etc.
    filter_size = 1 + 2 * erode_px
    pil_alpha = pil_alpha.filter(ImageFilter.MinFilter(size=filter_size))
    # Optional: slight blur to smooth edges?
    # pil_alpha = pil_alpha.filter(ImageFilter.GaussianBlur(radius=0.5))
    
    new_alpha = np.array(pil_alpha)
    arr[..., 3] = new_alpha
    return Image.fromarray(arr)


def extract_palette(img: Image.Image, n: int = 8) -> List[Tuple[int, int, int]]:
    # adaptive palette
    small = img.convert("RGB").resize((96, 96))
    pal = small.convert("P", palette=Image.ADAPTIVE, colors=n)
    palette = pal.getpalette()[: n * 3]
    colors = []
    for i in range(n):
        r = palette[i * 3]
        g = palette[i * 3 + 1]
        b = palette[i * 3 + 2]
        colors.append((r, g, b))
    # unique
    uniq = []
    for c in colors:
        if c not in uniq:
            uniq.append(c)
    return uniq


def make_video_bytes(frames: List[Image.Image], fps: int) -> Optional[bytes]:
    # Try mp4 via imageio (ffmpeg) then fallback to GIF
    try:
        buf = io.BytesIO()
        with imageio.get_writer(buf, format="ffmpeg", mode="I", fps=fps) as writer:
            for f in frames:
                arr = np.array(f.convert("RGBA"))
                writer.append_data(arr)
        return buf.getvalue()
    except Exception:
        try:
            buf = io.BytesIO()
            frames[0].save(buf, format="GIF", save_all=True, append_images=frames[1:], duration=int(1000 / fps), loop=0)
            return buf.getvalue()
        except Exception:
            return None


def bbox_from_alpha(img: Image.Image) -> Optional[Tuple[int, int, int, int]]:
    arr = np.array(img.convert("RGBA"))
    alpha = arr[..., 3]
    ys, xs = np.where(alpha > 8)
    if len(xs) == 0:
        return None
    x1 = int(xs.min())
    x2 = int(xs.max())
    y1 = int(ys.min())
    y2 = int(ys.max())
    return x1, y1, x2 + 1, y2 + 1


# ------- UI -------
st.title("AI Character Art → Animated Sprites")

left, right = st.columns([3, 1])

with left:
    # Video Input & Trimming
    st.header("1. Video Input & Trimming")
    
    # Initialize session state for video processing
    if "video_path" not in st.session_state:
        st.session_state.video_path = None
    if "video_duration" not in st.session_state:
        st.session_state.video_duration = 0.0
    
    video_file = st.file_uploader("Upload video", type=["mp4", "mov", "webm", "avi", "mkv"])
    
    # Handle video upload/loading
    if video_file:
        # Save to temp file if new upload (preserve extension so imageio/ffmpeg can detect backend)
        suffix = Path(video_file.name).suffix or ".mp4"
        tmp = Path(f".streamlit_tmp_video{suffix}")
        # Check if we need to write the file (new upload)
        # We can't easily check if it's the *same* file content without hashing, 
        # but we can rely on session state to know if we've processed it.
        # For simplicity, always write if file_uploader has a value.
        tmp.parent.mkdir(parents=True, exist_ok=True)
        with open(tmp, "wb") as f:
            f.write(video_file.getbuffer())
        st.session_state.video_path = str(tmp)
        
        # Get metadata
        try:
            reader = imageio.get_reader(st.session_state.video_path)
            meta = reader.get_meta_data()
            st.session_state.video_duration = float(meta.get("duration", 0.0))
            reader.close()
        except Exception as e:
            st.error(f"Error reading video metadata: {e}")

    if st.session_state.video_path:
        st.video(st.session_state.video_path)
        
        st.subheader("Trim & Loop")
        # Range slider for trimming
        duration = st.session_state.video_duration
        if duration > 0:
            start_val, end_val = st.slider(
                "Select Start & End Time (seconds)",
                min_value=0.0,
                max_value=duration,
                value=(0.0, min(duration, 5.0)), # Default to first 5s
                step=0.0001,
                format="%.3f"
            )

            # Also allow precise numeric input for start/end seconds
            ncol1, ncol2 = st.columns(2)
            start_val_num = ncol1.number_input("Start time (s)", min_value=0.0, max_value=duration, value=float(start_val), step=0.0001, format="%.3f")
            end_val_num = ncol2.number_input("End time (s)", min_value=0.0, max_value=duration, value=float(end_val), step=0.0001, format="%.3f")

            # If numeric inputs changed, use them (they stay in sync visually with the slider)
            start_val = float(start_val_num)
            end_val = float(end_val_num)
            col_prev, col_ext = st.columns(2)

            with col_prev:
                if st.button("Preview Loop"):
                    with st.spinner("Generating preview..."):
                        # Extract frames for preview (low fps)
                        try:
                            frames, fps = extract_frames_from_video(
                                st.session_state.video_path,
                                start_val,
                                end_val,
                                step=2 # Skip frames for faster preview
                            )
                            if frames:
                                vbytes = make_video_bytes(frames, fps=10) # Slow down preview
                                if vbytes:
                                    st.image(vbytes, caption=f"Loop Preview ({start_val}s - {end_val}s)")
                                else:
                                    st.error("Could not generate preview.")
                            else:
                                st.warning("No frames found in this range.")
                        except Exception as e:
                            st.error(f"Preview failed: {e}")

            with col_ext:
                sample_step = st.number_input("Sample every Nth frame", min_value=1, value=2, step=1)
                if st.button("Extract Frames for Editing"):
                    with st.spinner("Extracting full quality frames..."):
                        try:
                            frames, fps = extract_frames_from_video(
                                st.session_state.video_path,
                                start_val,
                                end_val,
                                int(sample_step)
                            )
                            st.session_state.video_frames = frames
                            st.session_state.video_fps = fps
                            st.success(f"Extracted {len(frames)} frames!")
                            st.rerun()
                        except Exception as e:
                            st.error(f"Extraction failed: {e}")
        else:
            st.warning("Could not determine video duration. Please try another file.")

    # Load frames from session state
    if "video_frames" in st.session_state and st.session_state.video_frames:
        images = st.session_state.video_frames
        st.info(f"Working with {len(images)} extracted frames.")
    else:
        st.info("Upload a video and extract frames to continue.")
        images = [] # Ensure images is defined for later sections

    # selection controls
    st.subheader("2. Select Frames")
    
    if images:
        # Select All / Clear
        c1, c2, c3 = st.columns([1, 1, 4])
        if c1.button("Select All"):
            st.session_state.selected_indices = list(range(len(images)))
        if c2.button("Clear"):
            st.session_state.selected_indices = []
            
        # Initialize selection if needed
        if "selected_indices" not in st.session_state:
            st.session_state.selected_indices = list(range(len(images)))

        # Thumbnails with checkboxes
        # We use a form or just interactive columns. 
        # For better UX, let's use the multiselect for logic but maybe just show the grid for visuals?
        # The user wants "Select Frames to Export with an Animation Preview"
        
        # Let's use a multiselect for the "official" selection list
        multiselect_options = [f"Frame {i+1}" for i in range(len(images))]
        default_vals = [multiselect_options[i] for i in st.session_state.selected_indices]
        
        selected_strs = st.multiselect("Selected Frames", options=multiselect_options, default=default_vals)
        
        # Update session state based on multiselect
        current_indices = [int(s.split(" ")[1]) - 1 for s in selected_strs]
        current_indices.sort()
        st.session_state.selected_indices = current_indices
        
        # Preview Animation of SELECTED frames
        if current_indices:
            st.caption("Previewing animation of selected frames:")
            preview_fps = st.slider("Preview FPS", 1, 60, 12, key="sel_fps")
            
            sel_images = [images[i] for i in current_indices]
            vbytes = make_video_bytes(sel_images, preview_fps)
            if vbytes:
                st.image(vbytes, caption=f"Animation ({len(sel_images)} frames)")
        else:
            st.warning("No frames selected.")

        # Visual Grid (Optional, just for reference)
        with st.expander("Show Frame Grid"):
            thumbs_per_row = 8
            rows = ceil(len(images) / thumbs_per_row)
            for r in range(rows):
                cols = st.columns(thumbs_per_row)
                for c in range(thumbs_per_row):
                    i = r * thumbs_per_row + c
                    if i < len(images):
                        caption = f"#{i+1}"
                        if i in current_indices:
                            caption += " (Sem)"
                        cols[c].image(images[i].resize((64, 64)), caption=caption)

    else:
        st.info("No frames to select.")

with right:
    st.header("3. Background & Polish")
    
    # Initialize chroma color in session state
    if "chroma_color" not in st.session_state:
        st.session_state.chroma_color = "#00FF00" # Default green

    st.subheader("Chroma Key")
    
    sample_frame = None
    # Tolerance slider (always available)
    tol = st.slider("Tolerance", 0, 150, 40, key="chroma_tol")
    
    # Palette extraction
    if images and st.session_state.selected_indices:
        sample_idx = st.session_state.selected_indices[0]
        sample_frame = images[sample_idx]
        
        # Click-to-pick using canvas
        st.write("Click on the image to pick background color:")
        if HAS_CANVAS:
            # Resize for canvas
            preview_w = 300
            scale = preview_w / sample_frame.width
            preview_h = int(sample_frame.height * scale)
            preview_img = sample_frame.resize((preview_w, preview_h))
            
            # Canvas (try PIL Image first, then data URL fallback)
            canvas_result = None
            canvas_err = None
            if HAS_CANVAS:
                try:
                    # Try passing the PIL Image directly
                    canvas_result = st_canvas(
                        fill_color="rgba(0,0,0,0)",
                        stroke_width=1,
                        background_image=preview_img,
                        height=preview_h,
                        width=preview_w,
                        drawing_mode="point",
                        key="canvas_chroma",
                        display_toolbar=False,
                    )
                except Exception as e1:
                    canvas_err = e1
                    # Try base64 data URL fallback
                    try:
                        buf = io.BytesIO()
                        preview_img.save(buf, format="PNG")
                        b64 = base64.b64encode(buf.getvalue()).decode("ascii")
                        data_url = f"data:image/png;base64,{b64}"
                        canvas_result = st_canvas(
                            fill_color="rgba(0,0,0,0)",
                            stroke_width=1,
                            background_image=data_url,
                            height=preview_h,
                            width=preview_w,
                            drawing_mode="point",
                            key="canvas_chroma_fallback",
                            display_toolbar=False,
                        )
                    except Exception as e2:
                        canvas_err = e2
            if canvas_result is None and canvas_err is not None:
                st.warning(f"Canvas not available: {canvas_err}. Falling back to color picker.")

            # Handle click if canvas returned a result
            if canvas_result and getattr(canvas_result, "json_data", None):
                try:
                    objs = canvas_result.json_data.get("objects")
                    if objs:
                        last_obj = objs[-1]
                        x = last_obj.get("left", 0)
                        y = last_obj.get("top", 0)
                        # Map to original
                        orig_x = int(x / scale)
                        orig_y = int(y / scale)
                        if 0 <= orig_x < sample_frame.width and 0 <= orig_y < sample_frame.height:
                            picked_color = sample_frame.convert("RGB").getpixel((orig_x, orig_y))
                            hex_color = "#%02x%02x%02x" % picked_color
                            st.session_state.chroma_color = hex_color
                except Exception:
                    # Protect against malformed canvas JSON
                    pass
        
        # Manual Picker (synced with session state)
        st.session_state.chroma_color = st.color_picker("Background Color", st.session_state.chroma_color)
        
        # Preview Chroma Key
        st.caption("Chroma Key Preview")
        target_rgb = tuple(int(st.session_state.chroma_color.lstrip("#")[i:i+2], 16) for i in (0, 2, 4))
        preview_removed = make_alpha_by_chroma(sample_frame, target_rgb, tol)
        st.image(preview_removed, caption="Background Removed")
        
    else:
        st.info("Select frames to enable Chroma Key.")

    # ROI auto-detection and manual tuning
    st.subheader("4. ROI & Sizing")
    
    if images:
        # Use selected frames for ROI detection, or all if none selected
        indices_for_roi = st.session_state.selected_indices if st.session_state.selected_indices else list(range(len(images)))
        sel_for_roi = [images[i] for i in indices_for_roi]
    else:
        sel_for_roi = []

    col_roi_btn, col_roi_info = st.columns([1, 2])
    if col_roi_btn.button("Auto-detect ROI"):
        # Use current chroma color for detection
        target_rgb = tuple(int(st.session_state.chroma_color.lstrip("#")[i:i+2], 16) for i in (0, 2, 4))
        roi = detect_roi_by_chroma(sel_for_roi, tol=tol) # tol from slider above
        if roi:
            st.session_state['roi'] = roi
            st.success(f"Detected ROI: {roi}")
        else:
            st.error("Could not detect ROI")

    # show and tune ROI sliders
    if 'roi' not in st.session_state:
        st.session_state['roi'] = None
    roi_val = st.session_state.get('roi')
    
    # Defaults
    if sample_frame:
        def_w, def_h = sample_frame.width, sample_frame.height
    else:
        def_w, def_h = 100, 100

    if roi_val:
        x1, y1, x2, y2 = roi_val
        w = x2 - x1
        h = y2 - y1
    else:
        x1 = y1 = 0
        w = def_w
        h = def_h

    if sample_frame:
        st.write("Adjust ROI (pixels)")
        c1, c2, c3, c4 = st.columns(4)
        rx = c1.number_input("X", min_value=0, max_value=def_w - 1, value=int(x1))
        ry = c2.number_input("Y", min_value=0, max_value=def_h - 1, value=int(y1))
        rw = c3.number_input("Width", min_value=1, max_value=def_w, value=int(w))
        rh = c4.number_input("Height", min_value=1, max_value=def_h, value=int(h))
        
        st.session_state['roi'] = (int(rx), int(ry), int(rx + rw), int(ry + rh))
        
        # show ROI overlay on preview
        # Create a copy for drawing
        # Apply chroma key for preview
        target_rgb = tuple(int(st.session_state.chroma_color.lstrip("#")[i:i+2], 16) for i in (0, 2, 4))
        preview_show = make_alpha_by_chroma(sample_frame, target_rgb, tol).convert("RGBA")
        
        draw = ImageDraw.Draw(preview_show)
        draw.rectangle([rx, ry, rx + rw, ry + rh], outline="red", width=3)
        
        st.image(preview_show, caption="ROI Preview (Red Box) with Chroma Key", width=300)

    st.subheader("5. Crop & Polish")
    c_crop, c_canvas = st.columns(2)
    crop_mode = c_crop.selectbox("Crop Mode", ["Animation Relative", "Center-Center"])
    canvas_w = c_canvas.selectbox("Canvas Width", [24, 32, 48, 64, 96, 128, 192, 256, 512], index=8)
    
    reduce_px = st.number_input("Trim padding (px)", min_value=0, max_value=50, value=0)

    st.write("Halo Remover")
    erode_px = st.slider("Erosion Amount (px)", 0, 5, 0)
    
    # Preview of final sprite
    if sample_frame and st.session_state.get('roi'):
        st.caption("Final Sprite Preview")
        # 1. Chroma Key
        target_rgb = tuple(int(st.session_state.chroma_color.lstrip("#")[i:i+2], 16) for i in (0, 2, 4))
        p_img = make_alpha_by_chroma(sample_frame, target_rgb, tol)
        
        # 2. Crop
        x1, y1, x2, y2 = st.session_state['roi']
        p_img = p_img.crop((x1, y1, x2, y2))
        
        # 3. Canvas Sizing (Match Export Logic)
        # Scale to fit inside canvas_w x canvas_w
        scale = min(canvas_w / max(1, p_img.width), canvas_w / max(1, p_img.height))
        new_size = (int(p_img.width * scale), int(p_img.height * scale))
        p_img = p_img.resize(new_size, Image.LANCZOS)
        
        # Place on square canvas
        canvas = Image.new("RGBA", (canvas_w, canvas_w), (0, 0, 0, 0))
        off_x = (canvas_w - new_size[0]) // 2
        off_y = (canvas_w - new_size[1]) // 2
        canvas.paste(p_img, (off_x, off_y), p_img)
        p_img = canvas
        
        # 4. Halo Removal
        if erode_px > 0:
            p_img = halo_remove(p_img, erode_px)
            
        st.image(p_img, caption=f"Final Preview ({canvas_w}x{canvas_w})", width=canvas_w * 2) # Scale up for visibility
    
    st.markdown("---")
    st.header("6. Export")
    
    col_exp1, col_exp2 = st.columns(2)
    export_sheet = col_exp1.button("Download Sprite Sheet", type="primary")
    export_zip = col_exp2.button("Download ZIP")

    if images and (export_sheet or export_zip):
        # Use session state indices
        sel = st.session_state.selected_indices if st.session_state.selected_indices else list(range(len(images)))
        sel_images = [images[i] for i in sel]
        
        # Use session state chroma color
        target_rgb = tuple(int(st.session_state.chroma_color.lstrip("#")[i:i+2], 16) for i in (0, 2, 4))

        # Process: chroma key -> compute common bbox -> crop/align -> resize -> halo -> collect
        processed = []
        
        with st.spinner("Processing frames..."):
            # First pass: remove background
            processed_tmp = [make_alpha_by_chroma(img, target_rgb, tol) for img in sel_images]

            if crop_mode == "Animation Relative":
                # prefer manually tuned ROI if present
                manual_roi = st.session_state.get('roi')
                if manual_roi:
                    x1, y1, x2, y2 = manual_roi
                else:
                    # bbox from first non-empty frame (or union?)
                    # Better to use union of all frames for animation relative
                    union_bbox = None
                    for p in processed_tmp:
                        b = bbox_from_alpha(p)
                        if b is not None:
                            if union_bbox is None:
                                union_bbox = b
                            else:
                                union_bbox = (
                                    min(union_bbox[0], b[0]),
                                    min(union_bbox[1], b[1]),
                                    max(union_bbox[2], b[2]),
                                    max(union_bbox[3], b[3])
                                )
                    
                    if union_bbox is None:
                        union_bbox = (0, 0, processed_tmp[0].width, processed_tmp[0].height)
                    x1, y1, x2, y2 = union_bbox
                
                # apply reduce/trim
                x1 = max(0, x1 - reduce_px)
                y1 = max(0, y1 - reduce_px)
                x2 = min(processed_tmp[0].width, x2 + reduce_px)
                y2 = min(processed_tmp[0].height, y2 + reduce_px)
                
                for p in processed_tmp:
                    crop = p.crop((x1, y1, x2, y2))
                    # Resize to fit canvas_w
                    # Maintain aspect ratio? Usually sprites are square or fit in square.
                    # Let's fit into canvas_w x canvas_w
                    
                    # Scale factor
                    scale = min(canvas_w / max(1, crop.width), canvas_w / max(1, crop.height))
                    new_size = (int(crop.width * scale), int(crop.height * scale))
                    crop_resized = crop.resize(new_size, Image.LANCZOS)
                    
                    canvas = Image.new("RGBA", (canvas_w, canvas_w), (0, 0, 0, 0))
                    # Center it?
                    off_x = (canvas_w - new_size[0]) // 2
                    off_y = (canvas_w - new_size[1]) // 2
                    canvas.paste(crop_resized, (off_x, off_y), crop_resized)
                    processed.append(canvas)
            else:
                # Center-Center: compute bbox per frame and center into canvas
                for p in processed_tmp:
                    b = bbox_from_alpha(p)
                    if b is None:
                        # blank -> transparent canvas
                        canvas = Image.new("RGBA", (canvas_w, canvas_w), (0, 0, 0, 0))
                        processed.append(canvas)
                        continue
                    x1, y1, x2, y2 = b
                    x1 = max(0, x1 - reduce_px)
                    y1 = max(0, y1 - reduce_px)
                    x2 = min(p.width, x2 + reduce_px)
                    y2 = min(p.height, y2 + reduce_px)
                    crop = p.crop((x1, y1, x2, y2))
                    
                    # resize preserving aspect to fit canvas
                    crop.thumbnail((canvas_w, canvas_w), Image.LANCZOS)
                    canvas = Image.new("RGBA", (canvas_w, canvas_w), (0, 0, 0, 0))
                    cx = (canvas_w - crop.width) // 2
                    cy = (canvas_w - crop.height) // 2
                    canvas.paste(crop, (cx, cy), crop)
                    processed.append(canvas)

            if erode_px > 0:
                processed = [halo_remove(p, erode_px) for p in processed]

            if not processed:
                st.error("No frames remain after processing")
            else:
                if export_sheet:
                    cols = int(ceil(np.sqrt(len(processed))))
                    sheet = make_spritesheet(processed, canvas_w, canvas_w, cols)
                    buf = io.BytesIO()
                    sheet.save(buf, format="PNG")
                    st.download_button("Download Sprite Sheet (Click again if needed)", data=buf.getvalue(), file_name="spritesheet.png", mime="image/png")

                if export_zip:
                    buf = io.BytesIO()
                    with zipfile.ZipFile(buf, "w") as z:
                        for idx, img in enumerate(processed):
                            b = pil_to_bytes(img)
                            z.writestr(f"sprite_{idx:04d}.png", b)
                    buf.seek(0)
                    st.download_button("Download ZIP (Click again if needed)", data=buf.getvalue(), file_name="sprites.zip", mime="application/zip")


st.sidebar.header("About")
st.sidebar.write("Video -> Sprite Pipeline")
st.sidebar.info("1. Upload Video & Trim\n2. Select Frames\n3. Pick Background Color\n4. Set ROI & Size\n5. Export")
