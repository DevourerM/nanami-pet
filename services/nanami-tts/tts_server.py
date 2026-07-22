"""Private, fixed-voice HTTP interface for Nanami's Japanese GPT-SoVITS model."""

from __future__ import annotations

import io
import os
import sys
import threading
import csv
from pathlib import Path

import soundfile as sf
import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field

APP_DIR = Path(__file__).resolve().parent
os.chdir(APP_DIR)
sys.path.insert(0, str(APP_DIR))
sys.path.insert(0, str(APP_DIR / "GPT_SoVITS"))

import TTS_infer_pack.TTS as tts_module


# GPT-SoVITS v2Pro only uses BERT features for Chinese.  This deployment only
# accepts Japanese, where upstream creates zero-valued features.  Avoid loading
# the unused 621 MB Chinese BERT checkpoint.
def _skip_unused_bert(self, _base_path: str) -> None:
    self.bert_tokenizer = None
    self.bert_model = None


tts_module.TTS.init_bert_weights = _skip_unused_bert
TTS = tts_module.TTS
TTS_Config = tts_module.TTS_Config

REFERENCE_AUDIO = APP_DIR.parent.parent / "assets" / "voice-reference" / "お兄ちゃん、今日の晩ご飯は何食べたい.wav"
REFERENCE_TEXT = "お兄ちゃん、今日の晩ご飯は何食べたい。"
CONFIG_PATH = APP_DIR / "config" / "tts_infer.yaml"
REFERENCE_ROOT = APP_DIR.parent.parent / "assets" / "voice-references"
REFERENCE_CATALOG_FILE = REFERENCE_ROOT / "gptsovits_reference_prompts.tsv"
DEFAULT_EMOTION = "neutral"
reference_catalog: dict[str, dict[str, str]] = {}

app = FastAPI(title="Nanami Japanese TTS", docs_url=None, redoc_url=None)
pipeline: TTS | None = None
inference_lock = threading.Lock()


class SynthesisRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=500, description="Japanese text to synthesize")
    emotion: str = Field(DEFAULT_EMOTION, min_length=1, max_length=32, description="Reference voice emotion")
    speed: float = Field(1.0, ge=0.5, le=2.0)
    seed: int = Field(-1, ge=-1)


def load_reference_catalog() -> dict[str, dict[str, str]]:
    """Load only the hand-picked GPT-SoVITS prompts shipped with the pet."""
    if not REFERENCE_CATALOG_FILE.is_file():
        raise RuntimeError(f"Reference catalog is missing: {REFERENCE_CATALOG_FILE}")

    catalog: dict[str, dict[str, str]] = {}
    with REFERENCE_CATALOG_FILE.open("r", encoding="utf-8", newline="") as handle:
        for row in csv.DictReader(handle, delimiter="\t"):
            emotion = str(row.get("pool") or "").strip().lower()
            prompt_text = str(row.get("reference_text") or "").strip()
            source_name = Path(str(row.get("audio") or "")).name
            if not emotion or not prompt_text or not source_name:
                continue
            matches = list(REFERENCE_ROOT.glob(f"{emotion}_*/{source_name}"))
            if matches:
                catalog[emotion] = {"audio": str(matches[0]), "text": prompt_text}

    if DEFAULT_EMOTION not in catalog:
        raise RuntimeError(f"Default '{DEFAULT_EMOTION}' reference is missing from {REFERENCE_ROOT}")
    return catalog


@app.on_event("startup")
def load_voice() -> None:
    global pipeline, reference_catalog
    reference_catalog = load_reference_catalog()
    pipeline = TTS(TTS_Config(str(CONFIG_PATH)))


@app.get("/health")
def health() -> dict[str, object]:
    return {
        "status": "ready" if pipeline is not None else "loading",
        "voice": "nanami",
        "language": "ja",
        "model_version": "v2Pro",
        "reference_emotions": sorted(reference_catalog),
    }


@app.post("/tts", response_class=Response)
def synthesize(request: SynthesisRequest) -> Response:
    if pipeline is None:
        raise HTTPException(status_code=503, detail="Voice model is still loading")
    emotion = request.emotion.strip().lower()
    reference = reference_catalog.get(emotion) or reference_catalog[DEFAULT_EMOTION]

    inputs = {
        "text": request.text.strip(),
        "text_lang": "ja",
        "ref_audio_path": reference["audio"],
        "prompt_text": reference["text"],
        "prompt_lang": "ja",
        "top_k": 15,
        "top_p": 1.0,
        "temperature": 1.0,
        "text_split_method": "cut5",
        "batch_size": 1,
        "batch_threshold": 0.75,
        "split_bucket": True,
        "speed_factor": request.speed,
        "fragment_interval": 0.3,
        "seed": request.seed,
        "media_type": "wav",
        "parallel_infer": True,
        "repetition_penalty": 1.35,
        "sample_steps": 32,
        "super_sampling": False,
        "streaming_mode": False,
    }
    try:
        with inference_lock:
            sample_rate, audio = next(pipeline.run(inputs))
        buffer = io.BytesIO()
        sf.write(buffer, audio, sample_rate, format="WAV")
        return Response(content=buffer.getvalue(), media_type="audio/wav")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"TTS inference failed: {exc}") from exc


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=9880, log_level="info")
