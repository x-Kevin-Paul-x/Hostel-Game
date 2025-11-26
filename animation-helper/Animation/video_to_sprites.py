import argparse
import os
import io
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

try:
    from rembg import remove
except Exception as e:
    remove = None


def parse_time(t):
    """Parse a time string like 'MM:SS' or seconds as float/int."""
    if t is None:
        return None
    if isinstance(t, (int, float)):
        return float(t)
    t = str(t)
    if ":" in t:
        parts = t.split(":")
        parts = [float(p) for p in parts]
        parts.reverse()
        sec = 0.0
        mul = 1.0
        for p in parts:
            sec += p * mul
            mul *= 60.0
        return sec
    return float(t)


def ensure_dir(path):
    Path(path).mkdir(parents=True, exist_ok=True)


def select_roi_interactive(frame):
    """Open a window for the user to select ROI. Returns (x,y,w,h)."""
    cv2.namedWindow("Select ROI", cv2.WINDOW_NORMAL)
    r = cv2.selectROI("Select ROI", frame, fromCenter=False, showCrosshair=True)
    cv2.destroyWindow("Select ROI")
    return tuple(int(x) for x in r)


def remove_bg_pil(img_pil):
    """Use rembg.remove on a PIL image, return RGBA PIL image."""
    if remove is None:
        raise RuntimeError(
            "rembg is not available. Install dependencies with `pip install -r requirements.txt`."
        )
    buf = io.BytesIO()
    img_pil.save(buf, format="PNG")
    input_bytes = buf.getvalue()
    output_bytes = remove(input_bytes)
    out_buf = io.BytesIO(output_bytes)
    out_img = Image.open(out_buf).convert("RGBA")
    return out_img


def frame_to_pil(frame_bgr):
    frame_rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
    return Image.fromarray(frame_rgb)


def main():
    parser = argparse.ArgumentParser(
        description="Extract frames from a video, remove backgrounds, and save sprites as PNGs with alpha."
    )
    parser.add_argument("--input", "-i", required=True, help="Input video file path")
    parser.add_argument(
        "--output", "-o", required=True, help="Output folder to store PNG sprites"
    )
    parser.add_argument(
        "--start",
        help="Start time (seconds or MM:SS). If omitted, starts at 0.",
        default=None,
    )
    parser.add_argument(
        "--end",
        help="End time (seconds or MM:SS). If omitted, goes to video end.",
        default=None,
    )
    parser.add_argument(
        "--roi",
        help="ROI as 'x,y,w,h' (integers). If omitted you can use --interactive-roi.",
        default=None,
    )
    parser.add_argument(
        "--interactive-roi",
        action="store_true",
        help="Open a window to pick ROI from the first frame in the range.",
    )
    parser.add_argument(
        "--step",
        type=int,
        default=1,
        help="Save every Nth frame (default 1 = every frame).",
    )
    parser.add_argument(
        "--prefix",
        default="sprite",
        help="Filename prefix for saved sprites (default 'sprite')",
    )
    args = parser.parse_args()

    input_path = args.input
    output_dir = args.output
    ensure_dir(output_dir)

    start_t = parse_time(args.start) or 0.0
    end_t = parse_time(args.end)

    cap = cv2.VideoCapture(input_path)
    if not cap.isOpened():
        print(f"Failed to open video: {input_path}")
        sys.exit(1)

    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)

    start_frame = int(start_t * fps)
    end_frame = int(end_t * fps) if end_t is not None else total_frames - 1
    if start_frame < 0:
        start_frame = 0
    if end_frame >= total_frames:
        end_frame = total_frames - 1

    cap.set(cv2.CAP_PROP_POS_FRAMES, start_frame)

    # Read first available frame for ROI selection
    ret, first_frame = cap.read()
    if not ret:
        print("Failed to read first frame from the requested start time.")
        sys.exit(1)

    roi = None
    if args.interactive_roi:
        roi = select_roi_interactive(first_frame)
        print(f"Selected ROI: {roi}")
    elif args.roi:
        try:
            parts = [int(p.strip()) for p in args.roi.split(",")]
            if len(parts) != 4:
                raise ValueError()
            roi = tuple(parts)
        except Exception:
            print("Invalid --roi value. Use 'x,y,w,h' with integers.")
            sys.exit(1)

    # Reset to start frame
    cap.set(cv2.CAP_PROP_POS_FRAMES, start_frame)

    out_idx = 0
    frame_idx = start_frame
    saved = 0
    try:
        while frame_idx <= end_frame:
            ret, frame = cap.read()
            if not ret:
                break
            if (frame_idx - start_frame) % args.step != 0:
                frame_idx += 1
                continue

            proc_frame = frame
            if roi is not None:
                x, y, w, h = roi
                # clamp
                x = max(0, x)
                y = max(0, y)
                w = max(1, w)
                h = max(1, h)
                proc_frame = frame[y : y + h, x : x + w]

            pil = frame_to_pil(proc_frame)
            try:
                out_pil = remove_bg_pil(pil)
            except Exception as e:
                print("Background removal failed:", e)
                print("Saving cropped RGB frame without alpha instead.")
                out_pil = pil.convert("RGBA")

            out_name = f"{args.prefix}_{out_idx:04d}.png"
            out_path = os.path.join(output_dir, out_name)
            out_pil.save(out_path)

            if out_idx % 10 == 0:
                print(f"Saved: {out_path} (frame {frame_idx}/{end_frame})")

            out_idx += 1
            saved += 1
            frame_idx += 1
    finally:
        cap.release()

    print(f"Done. Saved {saved} sprites to: {output_dir}")


if __name__ == "__main__":
    main()
