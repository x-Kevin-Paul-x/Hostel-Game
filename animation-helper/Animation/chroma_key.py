import argparse
import os
from pathlib import Path
from typing import Tuple

import numpy as np
from PIL import Image


def parse_color(s: str) -> Tuple[int, int, int]:
    parts = [p.strip() for p in s.split(",")]
    if len(parts) != 3:
        raise argparse.ArgumentTypeError("Color must be 'R,G,B' with three integers 0-255")
    try:
        r, g, b = [int(p) for p in parts]
    except ValueError:
        raise argparse.ArgumentTypeError("Color components must be integers")
    for v in (r, g, b):
        if not (0 <= v <= 255):
            raise argparse.ArgumentTypeError("Color components must be in 0..255")
    return r, g, b


def sample_background_from_corners(img: Image.Image, patch: int = 10) -> Tuple[int, int, int]:
    w, h = img.size
    # sample small patches from the four corners and average
    coords = [
        (0, 0, patch, patch),
        (w - patch, 0, w, patch),
        (0, h - patch, patch, h),
        (w - patch, h - patch, w, h),
    ]
    arr = np.array(img.convert("RGB"), dtype=np.float32)
    samples = []
    for (x1, y1, x2, y2) in coords:
        x1 = max(0, x1)
        y1 = max(0, y1)
        x2 = min(w, x2)
        y2 = min(h, y2)
        patch_arr = arr[y1:y2, x1:x2]
        if patch_arr.size == 0:
            continue
        samples.append(patch_arr.reshape(-1, 3))
    if not samples:
        return 0, 0, 0
    all_samples = np.concatenate(samples, axis=0)
    mean = all_samples.mean(axis=0)
    return int(mean[0]), int(mean[1]), int(mean[2])


def make_alpha_by_chroma(img: Image.Image, bg_color: Tuple[int, int, int], threshold: float) -> Image.Image:
    rgba = img.convert("RGBA")
    arr = np.array(rgba)
    rgb = arr[..., :3].astype(np.int16)
    bg = np.array(bg_color, dtype=np.int16)
    # Euclidean distance in RGB space
    dist = np.linalg.norm(rgb - bg, axis=-1)
    mask_transparent = dist <= threshold
    # Optionally, you can soften edges by applying a distance-based alpha ramp
    alpha = arr[..., 3].astype(np.float32)

    # New alpha: where close to bg -> 0, else keep existing 255
    alpha[mask_transparent] = 0
    arr[..., 3] = alpha.astype(np.uint8)

    return Image.fromarray(arr)


def process_folder(input_dir: Path, output_dir: Path, bgcolor, threshold: float, in_place: bool, sample_corners: bool):
    ensure = output_dir
    ensure.mkdir(parents=True, exist_ok=True)

    png_files = sorted([p for p in input_dir.glob("*.png")])
    if not png_files:
        print(f"No PNGs found in {input_dir}")
        return

    for p in png_files:
        img = Image.open(p)
        if sample_corners and bgcolor is None:
            detected = sample_background_from_corners(img)
            print(f"Detected background color for {p.name}: {detected}")
            bg = detected
        elif bgcolor is not None:
            bg = bgcolor
        else:
            # fallback to top-left pixel
            px = img.convert("RGB").getpixel((0, 0))
            bg = px

        out_img = make_alpha_by_chroma(img, bg, threshold)

        if in_place:
            out_path = p
        else:
            out_path = output_dir / p.name

        out_img.save(out_path)
        print(f"Saved: {out_path}")


def main():
    parser = argparse.ArgumentParser(description="Simple chroma-key utility for PNGs (offline).")
    parser.add_argument("--input", "-i", required=True, help="Input folder containing PNGs")
    parser.add_argument("--output", "-o", required=False, help="Output folder for processed PNGs (defaults to input/_chroma)")
    parser.add_argument(
        "--bgcolor",
        type=parse_color,
        help="Background color to remove as 'R,G,B' (integer 0-255). If omitted, samples top-left pixel or use --sample-corners.",
        default=None,
    )
    parser.add_argument(
        "--threshold",
        type=float,
        default=60.0,
        help="Distance threshold in RGB space (default 60). Higher = more removed.",
    )
    parser.add_argument(
        "--in-place",
        action="store_true",
        help="Overwrite files in the input folder (use with caution)",
    )
    parser.add_argument(
        "--sample-corners",
        action="store_true",
        help="Auto-detect background color by averaging image corners (useful for letterboxed frames)",
    )

    args = parser.parse_args()
    input_dir = Path(args.input)
    if not input_dir.exists() or not input_dir.is_dir():
        print("Input folder does not exist or is not a directory")
        return

    output_dir = Path(args.output) if args.output else input_dir / "_chroma"
    if args.in_place:
        output_dir = input_dir

    process_folder(input_dir, output_dir, args.bgcolor, args.threshold, args.in_place, args.sample_corners)


if __name__ == "__main__":
    main()
