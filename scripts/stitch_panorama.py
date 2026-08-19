#!/usr/bin/env python3
"""Stitches a set of overlapping frames into an equirectangular 360 panorama.

Usage: python3 stitch_panorama.py <session_dir>

<session_dir> must contain:
  metadata.json   { "frames": [{ "frameId", "filename", "yaw", "pitch" }, ...] }
  frames/         the frame image files referenced by "filename"

Writes into <session_dir>/output/:
  panorama_master.jpg   full stitched resolution
  panorama_mobile.jpg   resized to a mobile-friendly equirectangular size
  thumbnail.jpg         small preview

Prints a single JSON object to stdout describing the result. Never raises past
top level — all failure modes are reported as a classified JSON error so the
caller (panoramaStitchService.js) can store a meaningful failureReason.
"""
import json
import os
import sys

MOBILE_MAX_WIDTH = 4096
THUMB_WIDTH = 512

ERROR_MAP = {
    "NEED_MORE_IMGS": "INSUFFICIENT_OVERLAP",
    "HOMOGRAPHY_EST_FAIL": "FEATURE_MATCH_FAILURE",
    "CAMERA_PARAMS_ADJUST_FAIL": "CAMERA_PARAMS_FAILURE",
}


def fail(reason, message):
    print(json.dumps({"success": False, "reason": reason, "message": message}))
    sys.exit(0)


def main():
    if len(sys.argv) < 2:
        fail("UNKNOWN", "session_dir argument is required")

    session_dir = sys.argv[1]
    meta_path = os.path.join(session_dir, "metadata.json")
    frames_dir = os.path.join(session_dir, "frames")
    output_dir = os.path.join(session_dir, "output")

    if not os.path.isfile(meta_path):
        fail("UNKNOWN", "metadata.json not found")

    try:
        with open(meta_path, "r", encoding="utf-8") as handle:
            meta = json.load(handle)
    except Exception as error:  # noqa: BLE001 - reported to caller, not re-raised
        fail("CORRUPTED_IMAGE", f"metadata.json could not be parsed: {error}")

    frames = sorted(meta.get("frames", []), key=lambda item: item.get("yaw", 0))
    if len(frames) < 8:
        fail("INSUFFICIENT_OVERLAP", f"Only {len(frames)} frames supplied; at least 8 are required")

    try:
        import cv2
        import numpy as np
    except ImportError as error:
        fail("UNKNOWN", f"opencv-python-headless is not installed: {error}")

    images = []
    for frame in frames:
        path = os.path.join(frames_dir, frame["filename"])
        image = cv2.imread(path)
        if image is None:
            continue
        images.append(image)

    if len(images) < 8:
        fail("CORRUPTED_IMAGE", f"Only {len(images)} of {len(frames)} frame files were readable")

    try:
        stitcher = cv2.Stitcher_create(cv2.Stitcher_PANORAMA)
        status, panorama = stitcher.stitch(images)
    except Exception as error:  # noqa: BLE001
        fail("UNKNOWN", f"Stitcher raised an exception: {error}")

    if status != cv2.Stitcher_OK:
        code_name = {
            cv2.Stitcher_ERR_NEED_MORE_IMGS: "NEED_MORE_IMGS",
            cv2.Stitcher_ERR_HOMOGRAPHY_EST_FAIL: "HOMOGRAPHY_EST_FAIL",
            cv2.Stitcher_ERR_CAMERA_PARAMS_ADJUST_FAIL: "CAMERA_PARAMS_ADJUST_FAIL",
        }.get(status, "UNKNOWN")
        fail(ERROR_MAP.get(code_name, "UNKNOWN"), f"cv2.Stitcher returned status {status}")

    height, width = panorama.shape[:2]
    target_ratio = 2.0
    current_ratio = width / max(height, 1)
    if current_ratio < target_ratio * 0.5 or current_ratio > target_ratio * 2:
        # The stitched result is far from a plausible 360 equirectangular shape
        # (roughly 2:1). This usually means partial coverage or a badly formed
        # panorama rather than a clean full-sphere capture.
        fail("MISSING_REGION", f"Stitched result has an unexpected aspect ratio ({width}x{height})")

    os.makedirs(output_dir, exist_ok=True)

    master_path = os.path.join(output_dir, "panorama_master.jpg")
    cv2.imwrite(master_path, panorama, [cv2.IMWRITE_JPEG_QUALITY, 92])

    mobile_width = min(width, MOBILE_MAX_WIDTH)
    mobile_height = int(mobile_width / current_ratio)
    mobile = cv2.resize(panorama, (mobile_width, mobile_height), interpolation=cv2.INTER_AREA)
    mobile_path = os.path.join(output_dir, "panorama_mobile.jpg")
    cv2.imwrite(mobile_path, mobile, [cv2.IMWRITE_JPEG_QUALITY, 85])

    thumb_width = min(width, THUMB_WIDTH)
    thumb_height = int(thumb_width / current_ratio)
    thumb = cv2.resize(panorama, (thumb_width, thumb_height), interpolation=cv2.INTER_AREA)
    thumb_path = os.path.join(output_dir, "thumbnail.jpg")
    cv2.imwrite(thumb_path, thumb, [cv2.IMWRITE_JPEG_QUALITY, 75])

    print(json.dumps({
        "success": True,
        "master": {"path": master_path, "width": width, "height": height, "fileSizeBytes": os.path.getsize(master_path)},
        "mobile": {"path": mobile_path, "width": mobile_width, "height": mobile_height, "fileSizeBytes": os.path.getsize(mobile_path)},
        "thumbnail": {"path": thumb_path, "width": thumb_width, "height": thumb_height, "fileSizeBytes": os.path.getsize(thumb_path)},
        "framesUsed": len(images),
    }))


if __name__ == "__main__":
    main()
