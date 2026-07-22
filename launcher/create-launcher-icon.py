"""Convert the local project PNG into the multi-size Windows launcher icon."""

from pathlib import Path
import sys

from PIL import Image


source = Path(sys.argv[1])
destination = Path(sys.argv[2])
destination.parent.mkdir(parents=True, exist_ok=True)

with Image.open(source) as image:
    image.convert("RGBA").save(
        destination,
        format="ICO",
        sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
    )
