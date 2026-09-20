from typing import Literal
from pydantic import BaseModel, Field

Scenario = Literal["single", "pair", "timeline"]


class ImageInput(BaseModel):
    clientId: str
    date: str | None = None
    label: str | None = None
    storedPath: str | None = None
    fileIndex: int | None = None


class ModelConfig(BaseModel):
    model: str = "glm-4.6v"
    temperature: float = Field(default=0.1, ge=0, le=2)
    maxTokens: int = Field(default=1500, ge=1, le=32768)


class InferenceMetadata(BaseModel):
    scenario: Scenario
    systemPrompt: str
    userPrompt: str
    region: str = "full_face"
    images: list[ImageInput]
    modelConfig: ModelConfig


class PresetInput(BaseModel):
    scenario: Scenario
    name: str
    system_prompt: str
    user_prompt: str

