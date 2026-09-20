import base64, hashlib, json, mimetypes
from datetime import date
from pathlib import Path
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from . import config, storage
from .assemblers import PreparedImage, assemble
from .provider import ProviderError, invoke
from .schemas import InferenceMetadata, PresetInput

app = FastAPI(title="Skin Care Vision Prompt Lab")
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"], allow_methods=["*"], allow_headers=["*"])


def _safe_path(name: str) -> Path:
    path = (config.IMAGE_DIR / Path(name).name).resolve()
    if config.IMAGE_DIR.resolve() not in path.parents: raise HTTPException(400, "invalid image path")
    return path


async def _store_image(file: UploadFile) -> tuple[str, str, bytes]:
    data = await file.read()
    if len(data) > config.MAX_IMAGE_BYTES: raise HTTPException(413, "image is too large")
    mime = file.content_type or mimetypes.guess_type(file.filename or "")[0] or "application/octet-stream"
    if mime not in {"image/jpeg", "image/png", "image/webp", "image/gif"}: raise HTTPException(415, f"unsupported image type: {mime}")
    digest = hashlib.sha256(data).hexdigest(); suffix = mimetypes.guess_extension(mime) or ".img"
    path = config.IMAGE_DIR / f"{digest}{suffix}"; path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists(): path.write_bytes(data)
    return str(path.relative_to(config.ROOT)), mime, data


def _data_url(path: Path, mime: str) -> str:
    return f"data:{mime};base64,{base64.b64encode(path.read_bytes()).decode()}"


def _sanitize(payload: dict) -> dict:
    clean = json.loads(json.dumps(payload))
    for message in clean.get("messages", []):
        if isinstance(message.get("content"), list):
            for part in message["content"]:
                if part.get("type") == "image_url":
                    url = part["image_url"]["url"]; head, _, encoded = url.partition(",")
                    part["image_url"]["url"] = f"<base64 image omitted: {head.removeprefix('data:')}, {len(encoded) * 3 // 4} bytes>"
    return clean


@app.get("/api/health")
def health(): return {"ok": True, "model": config.DEFAULT_MODEL, "configured": bool(config.API_KEY)}


@app.post("/api/inference")
async def inference(metadata: str = Form(...), files: list[UploadFile] = File(default=[])):
    try: meta = InferenceMetadata.model_validate_json(metadata)
    except Exception as exc: raise HTTPException(422, f"invalid metadata: {exc}") from exc
    if meta.scenario == "single" and len(meta.images) != 1: raise HTTPException(422, "single requires one image")
    if meta.scenario == "pair" and {x.label for x in meta.images} != {"Earlier", "Later"}: raise HTTPException(422, "pair requires Earlier and Later images")
    if meta.scenario == "timeline" and len(meta.images) < 2: raise HTTPException(422, "timeline requires at least two images")
    for image in meta.images:
        if image.date:
            try: date.fromisoformat(image.date)
            except ValueError as exc: raise HTTPException(422, f"invalid date for {image.clientId}: {image.date}") from exc
    saved: list[PreparedImage] = []
    file_cache: dict[int, tuple[str, str, bytes]] = {}
    for image in meta.images:
        if image.storedPath:
            path = _safe_path(image.storedPath); mime = mimetypes.guess_type(path.name)[0] or "image/jpeg"; data = path.read_bytes()
            stored = image.storedPath
        else:
            if image.fileIndex is None or image.fileIndex >= len(files): raise HTTPException(422, f"missing file for {image.clientId}")
            if image.fileIndex not in file_cache: file_cache[image.fileIndex] = await _store_image(files[image.fileIndex])
            stored, mime, data = file_cache[image.fileIndex]; path = config.ROOT / stored
        saved.append(PreparedImage(image.clientId, image.date, image.label or "image", mime, f"data:{mime};base64,{base64.b64encode(data).decode()}", stored))
    if meta.scenario == "timeline": saved.sort(key=lambda x: x.date or "9999-12-31")
    messages = assemble(meta.model_dump(), saved)
    request_payload = {"model": meta.modelConfig.model, "messages": messages, "temperature": meta.modelConfig.temperature, "max_tokens": meta.modelConfig.maxTokens}
    if any(isinstance(m["content"], list) for m in messages): request_payload["thinking"] = {"type": "disabled"}
    try: result = await invoke(messages, meta.modelConfig.model, meta.modelConfig.temperature, meta.modelConfig.maxTokens)
    except ProviderError as exc: raise HTTPException(exc.status or 502, {"message": str(exc), "request_id": exc.request_id}) from exc
    sanitized = _sanitize(request_payload)
    saved_by_id = {x.client_id: x for x in saved}
    run = {"id": storage.now().replace(":", "-") + "-" + hashlib.sha1(storage.now().encode()).hexdigest()[:6], "created_at": storage.now(), "scenario": meta.scenario, "system_prompt": meta.systemPrompt, "user_prompt": meta.userPrompt, "region": meta.region, "images": [x.model_dump() | {"storedPath": saved_by_id[x.clientId].stored_path} for x in meta.images], "model": meta.modelConfig.model, "temperature": meta.modelConfig.temperature, "max_tokens": meta.modelConfig.maxTokens, "final_request_sanitized": sanitized, "raw_response": result["raw_response"], "output": result["output"], "latency_ms": result["latency_ms"], "input_tokens": result["input_tokens"], "output_tokens": result["output_tokens"], "total_tokens": result["total_tokens"], "request_id": result["request_id"]}
    storage.save_run(run)
    return run


@app.get("/api/runs")
def runs(): return storage.all_runs()
@app.get("/api/runs/{run_id}")
def run(run_id: str):
    item = next((x for x in storage.all_runs() if x["id"] == run_id), None)
    if not item: raise HTTPException(404, "run not found")
    return item
@app.get("/api/images/{filename}")
def image(filename: str): return FileResponse(_safe_path(filename))
@app.get("/api/presets")
def presets(): return storage.all_presets()
@app.post("/api/presets")
def create_preset(item: PresetInput): return storage.save_preset(item.model_dump())
@app.delete("/api/presets/{item_id}")
def remove_preset(item_id: str): storage.delete_preset(item_id); return {"ok": True}
