import os
import tifffile
import numpy as np

# ============================================================
# CHANGE ONLY THIS PATH IF YOUR TIFF IS IN A DIFFERENT JOB
# ============================================================

TIFF_PATH = r"D:\SIH\Version1\geoenhance\backend\temporary\jobs\a289a4e9-14fd-4c4a-8d8e-d05327f189f2\imagery\01.tif"

# Expected GeoEnhance / ML 19-channel input band order
INPUT_BAND_ORDER_19 = [
    "B01",
    "B02",
    "B03",
    "B04",
    "B05",
    "B06",
    "B07",
    "B08",
    "B8A",
    "B09",
    "B11",
    "B12",
    "dataMask",
    "CLM",
    "CLP",
    "sunAzimuthAngles",
    "sunZenithAngles",
    "viewAzimuthMean",
    "viewZenithMean",
]

# Expected 4-channel HR_ps model output
HR_PS_BAND_ORDER_4 = ["Red", "Green", "Blue", "NIR"]

BAND_ORDER = INPUT_BAND_ORDER_19


def get_tag(page, name):
    tag = page.tags.get(name)
    return tag.value if tag else "NOT FOUND"


print("=" * 70)
print("GeoEnhance TIFF / GeoTIFF Verification Report")
print("=" * 70)

print("\n[FILE INFORMATION]")
print("File:", os.path.basename(TIFF_PATH))
print("Path:", TIFF_PATH)

if os.path.exists(TIFF_PATH):
    print("File size:", os.path.getsize(TIFF_PATH), "bytes")
else:
    print("ERROR: TIFF file does not exist.")
    raise SystemExit(1)


with tifffile.TiffFile(TIFF_PATH) as tif:

    print("\n[TIFF STRUCTURE]")
    print("Number of TIFF pages:", len(tif.pages))

    page = tif.pages[0]

    print("Image width:", page.imagewidth)
    print("Image height:", page.imagelength)
    print("Samples per pixel:", page.samplesperpixel)
    print("Shape:", page.shape)
    print("Data type:", page.dtype)
    print("Bits per sample:", get_tag(page, "BitsPerSample"))
    print("Sample format:", get_tag(page, "SampleFormat"))
    print("Compression:", get_tag(page, "Compression"))
    print("Photometric:", get_tag(page, "Photometric"))

    print("\n[GEOTIFF / GEOSPATIAL INFORMATION]")

    print("ModelPixelScaleTag:")
    print(get_tag(page, "ModelPixelScaleTag"))

    print("\nModelTiepointTag:")
    print(get_tag(page, "ModelTiepointTag"))

    print("\nGeoKeyDirectoryTag:")
    print(get_tag(page, "GeoKeyDirectoryTag"))

    # Read raster
    data = tifffile.imread(TIFF_PATH)

    print("\n[RASTER DATA]")
    print("Array shape:", data.shape)
    print("Array dtype:", data.dtype)

    if data.ndim != 3:
        print("WARNING: Expected a 3-dimensional array.")

    print("\n[BAND ORDER USED BY GE OENHANCE]")
    for i, band in enumerate(BAND_ORDER, start=1):
        print(f"Channel {i:02d} -> {band}")

    print("\n[BAND STATISTICS]")
    print("-" * 70)

    for i, band in enumerate(BAND_ORDER):

        values = data[:, :, i]

        finite_values = values[np.isfinite(values)]

        if len(finite_values) == 0:
            print(f"{i+1:02d}. {band}: NO FINITE VALUES")
            continue

        print(f"\nChannel {i+1:02d} -> {band}")
        print(f"  Min:        {np.min(finite_values):.8f}")
        print(f"  Max:        {np.max(finite_values):.8f}")
        print(f"  Mean:       {np.mean(finite_values):.8f}")
        print(f"  Std Dev:    {np.std(finite_values):.8f}")
        print(f"  Zero count: {np.sum(values == 0)}")
        print(f"  NaN count:  {np.sum(np.isnan(values))}")
        print(f"  Inf count:  {np.sum(np.isinf(values))}")

    print("\n[ML CONTRACT]")
    if data.ndim == 3 and data.shape[2] == 4:
        print("Detected format: HR_ps (Super-Resolved Output)")
        print("Expected shape: (1054, 1054, 4)")
        print("Expected channels: Red, Green, Blue, NIR")
    else:
        print("Detected format: Multi-temporal Input Frame")
        print("Number of input TIFFs per job: 8")
        print("Bands per TIFF:", len(BAND_ORDER))
        print("Expected shape: (~159, 158, 19)")
        print("Expected dtype: FLOAT32")
        print("Expected band order:")
        print(" -> ".join(BAND_ORDER))

print("\n" + "=" * 70)
print("End of Verification Report")
print("=" * 70)