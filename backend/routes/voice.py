import wave

from fastapi import APIRouter, HTTPException, Response, UploadFile
from pydantic import BaseModel, Field
from voice.stt import transcribe
from voice.tts import speak

router = APIRouter(prefix="/voice", tags=["voice"])


class SpeakRequest(BaseModel):
    # The frontend sends one sentence at a time, so this is a generous cap
    text: str = Field(min_length=1, max_length=1000)


# Plain def: FastAPI runs these in its threadpool, so onnx inference doesn't block the loop
@router.post("/transcribe")
def transcribe_audio(file: UploadFile):
    try:
        return {"text": transcribe(file.file.read())}
    except (wave.Error, ValueError) as e:
        raise HTTPException(400, f"unreadable audio: {e}")


@router.post("/speak")
def speak_text(body: SpeakRequest):
    return Response(speak(body.text), media_type="audio/wav")
