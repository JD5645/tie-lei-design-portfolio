from __future__ import annotations

import os
import shutil
import subprocess
from pathlib import Path

from PIL import Image, ImageOps


ROOT = Path(__file__).resolve().parent
OUTPUT = ROOT / "assets" / "viewer"
SOURCE_DIRECTORIES = [
    ROOT / "01-品牌设计",
    ROOT / "02-AIGC",
    ROOT / "03-主图、A+设计",
    ROOT / "04-建模、渲染",
    ROOT / "05-其他设计",
]
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".avif"}
Image.MAX_IMAGE_PIXELS = None


def viewer_path(source: Path, suffix: str) -> Path:
    relative = source.relative_to(ROOT)
    return OUTPUT / Path(f"{relative}{suffix}")


def image_target_size(width: int, height: int) -> tuple[int, int]:
    if height >= width * 3:
        scale = min(1.0, 1600 / width, 16000 / height)
    else:
        scale = min(1.0, 2400 / max(width, height))
    return max(1, round(width * scale)), max(1, round(height * scale))


def optimize_image(source: Path) -> tuple[int, int]:
    destination = viewer_path(source, ".webp")
    destination.parent.mkdir(parents=True, exist_ok=True)
    with Image.open(source) as opened:
        image = ImageOps.exif_transpose(opened)
        target = image_target_size(*image.size)
        if target != image.size:
            image = image.resize(target, Image.Resampling.LANCZOS, reducing_gap=3.0)
        if image.mode not in {"RGB", "RGBA"}:
            image = image.convert("RGBA" if "transparency" in image.info else "RGB")
        image.save(
            destination,
            "WEBP",
            quality=80,
            method=6,
            optimize=True,
            exact=image.mode == "RGBA",
        )
    return source.stat().st_size, destination.stat().st_size


def find_ffmpeg() -> str:
    configured = os.environ.get("FFMPEG")
    if configured and Path(configured).exists():
        return configured
    executable = shutil.which("ffmpeg")
    if executable:
        return executable
    try:
        import imageio_ffmpeg

        return imageio_ffmpeg.get_ffmpeg_exe()
    except (ImportError, RuntimeError) as error:
        raise RuntimeError("FFmpeg is required to generate lightweight video previews") from error


def optimize_video(source: Path, ffmpeg: str) -> tuple[int, int]:
    destination = viewer_path(source, ".preview.mp4")
    destination.parent.mkdir(parents=True, exist_ok=True)
    command = [
        ffmpeg,
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        str(source),
        "-map",
        "0:v:0",
        "-map",
        "0:a?",
        "-vf",
        "scale='min(1280,iw)':-2",
        "-c:v",
        "libx264",
        "-preset",
        "medium",
        "-crf",
        "27",
        "-maxrate",
        "1600k",
        "-bufsize",
        "3200k",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        "64k",
        "-movflags",
        "+faststart",
        str(destination),
    ]
    subprocess.run(command, check=True)
    return source.stat().st_size, destination.stat().st_size


def main() -> None:
    images: list[Path] = []
    videos: list[Path] = []
    for directory in SOURCE_DIRECTORIES:
        for source in directory.rglob("*"):
            if not source.is_file():
                continue
            extension = source.suffix.lower()
            if extension in IMAGE_EXTENSIONS:
                images.append(source)
            elif extension == ".mp4":
                videos.append(source)

    source_image_bytes = 0
    preview_image_bytes = 0
    for index, source in enumerate(images, start=1):
        before, after = optimize_image(source)
        source_image_bytes += before
        preview_image_bytes += after
        if index % 20 == 0 or index == len(images):
            print(f"Images {index}/{len(images)}")

    ffmpeg = find_ffmpeg()
    source_video_bytes = 0
    preview_video_bytes = 0
    for index, source in enumerate(videos, start=1):
        before, after = optimize_video(source, ffmpeg)
        source_video_bytes += before
        preview_video_bytes += after
        print(f"Videos {index}/{len(videos)}")

    image_saving = 1 - preview_image_bytes / source_image_bytes if source_image_bytes else 0
    video_saving = 1 - preview_video_bytes / source_video_bytes if source_video_bytes else 0
    print(
        f"Generated {len(images)} image previews ({preview_image_bytes / 1024 / 1024:.2f} MB, "
        f"{image_saving:.0%} smaller) and {len(videos)} video previews "
        f"({preview_video_bytes / 1024 / 1024:.2f} MB, {video_saving:.0%} smaller)."
    )


if __name__ == "__main__":
    main()
