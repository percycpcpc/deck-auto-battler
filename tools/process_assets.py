from pathlib import Path
from PIL import Image

ROOT = Path(r"C:\Users\Crimson\.codex\generated_images\01a183c0-aff2-7b12-9f7d-5a9ebc062499")
OUT = Path(__file__).resolve().parents[1] / "assets"

FILES = {
    "card_back.png": ("exec-9e82d632-5518-4428-a7f6-0b25ea41aa33.png", (256, 384), False),
    "frame_cost1.png": ("exec-872513dd-1488-476e-bfc6-a28e53c637cb.png", (256, 384), True),
    "frame_cost2.png": ("exec-17b97329-76fc-4d21-aad8-e643482015cb.png", (256, 384), True),
    "frame_cost3.png": ("exec-ff1dfcdf-0a74-43f2-b062-37bde1ab9889.png", (256, 384), True),
    "bg_battlefield.png": ("exec-d5f1652f-99ec-40d5-b6db-27cf50337f4e.png", (1920, 1080), False),
    "banner_draft.png": ("exec-6e506c31-6892-42bc-bfd6-e04e6749e968.png", (1024, 256), False),
    "banner_victory.png": ("exec-d253d806-18bb-44e9-bf4f-023bdfa1a48a.png", (1024, 256), False),
    "btn_primary.png": ("exec-b19766e0-e992-4f41-978e-c52cf4c454f1.png", (320, 96), True),
    "panel_hp.png": ("exec-43ff92ed-5dbd-4f38-9bb9-f7c552d7080d.png", (480, 64), True),
    "slot_charger.png": ("exec-708fb308-e174-43d7-a23f-23989c8e21a5.png", (160, 240), True),
    "icon_ds.png": ("exec-a6cbb958-f231-4354-b118-0299eda921c3.png", (64, 64), True),
    "icon_poison.png": ("exec-7610fdac-8066-4940-a17e-4ce85853b18c.png", (64, 64), True),
    "icon_dr.png": ("exec-da7e24e0-8409-49f1-a9d7-e41da2a4dd5c.png", (64, 64), True),
    "icon_aura.png": ("exec-0f03b066-81b2-4312-92f4-4b73b6a5f2c6.png", (64, 64), True),
    "icon_wf.png": ("exec-725141a0-8f53-467e-a4fb-e5ffec10d458.png", (64, 64), True),
    "icon_bc.png": ("exec-6fae3634-de16-4d0b-9796-75e695f0062a.png", (64, 64), True),
}


def linear_unmix_magenta(image: Image.Image) -> Image.Image:
    source = image.convert("RGBA")
    out = Image.new("RGBA", source.size)
    pixels = []
    for r, g, b, alpha8 in source.getdata():
        a = alpha8 / 255.0
        # Observe the authored pixel over a #FF00FF key, then invert that composite.
        observed = (r * a + 255 * (1 - a), g * a, b * a + 255 * (1 - a))
        if a < 0.15:
            pixels.append((0, 0, 0, 0))
            continue
        true = (
            round((observed[0] - (1 - a) * 255) / a),
            round(observed[1] / a),
            round((observed[2] - (1 - a) * 255) / a),
        )
        pixels.append(tuple(max(0, min(255, value)) for value in true) + (alpha8,))
    out.putdata(pixels)
    return out


for name, (source_name, size, keyed) in FILES.items():
    image = Image.open(ROOT / source_name).convert("RGBA")
    image = image.resize(size, Image.Resampling.LANCZOS)
    if keyed:
        image = linear_unmix_magenta(image)
    else:
        matte = Image.new("RGBA", size, (20, 16, 28, 255))
        matte.alpha_composite(image)
        image = matte.convert("RGB")
    image.save(OUT / name, optimize=True)

for name in FILES:
    image = Image.open(OUT / name)
    opaque = [px[:3] for px in image.convert("RGBA").getdata() if px[3] >= 230]
    channels = [channel for px in opaque for channel in px]
    spread = max(channels) - min(channels) if channels else 0
    print(f"{name} -> {image.width}x{image.height} + {image.mode}; opaque RGB spread={spread}")
