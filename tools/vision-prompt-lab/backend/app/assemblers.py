from dataclasses import dataclass
from typing import Any


@dataclass
class PreparedImage:
    client_id: str
    date: str | None
    label: str
    mime: str
    data_url: str
    stored_path: str


def _header(meta: dict[str, Any], images: list[PreparedImage]) -> str:
    lines = [f"Region under review: {meta['region']}."]
    for index, image in enumerate(images, 1):
        date = image.date or "date not provided"
        lines.append(f"image_{index}: {image.label}; date={date}; image follows in this order.")
    return "\n".join(lines)


def assemble(meta: dict[str, Any], images: list[PreparedImage]) -> list[dict[str, Any]]:
    scenario = meta["scenario"]
    if scenario == "pair":
        ordered = sorted(images, key=lambda x: 0 if x.label.lower() == "earlier" else 1)
        text = "Pair comparison. The semantic roles are explicit; do not infer them from upload order.\n"
        text += "\n".join(
            f"image_{i}: role={image.label}; date={image.date or 'date not provided'}"
            for i, image in enumerate(ordered, 1)
        )
    elif scenario == "timeline":
        ordered = sorted(images, key=lambda x: x.date or "9999-12-31")
        text = "Observation timeline in ascending date order.\n" + "\n".join(
            f"timepoint_{i}: date={image.date or 'date not provided'}; image_{i}"
            for i, image in enumerate(ordered, 1)
        )
    else:
        ordered = images
        text = "Single observation. The image below is the current image for the named region.\n"
    text += _header(meta, ordered)
    content: list[dict[str, Any]] = [{"type": "text", "text": meta["userPrompt"] + "\n\n" + text}]
    for image in ordered:
        content.append({"type": "text", "text": f"[{image.label} | {image.date or 'date not provided'}]"})
        content.append({"type": "image_url", "image_url": {"url": image.data_url}})
    return [
        {"role": "system", "content": meta["systemPrompt"]},
        {"role": "user", "content": content},
    ]

