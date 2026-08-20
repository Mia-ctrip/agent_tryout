from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.services.auth_service import normalize_email


class _StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class RegisterRequest(_StrictModel):
    email: str = Field(min_length=3, max_length=320)
    password: str = Field(min_length=10, max_length=128)
    nickname: Optional[str] = Field(default=None, max_length=64)
    device_id: Optional[str] = Field(default=None, max_length=128)
    device_name: Optional[str] = Field(default=None, max_length=128)

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        return normalize_email(value)

    @field_validator("nickname", "device_id", "device_name")
    @classmethod
    def strip_optional_text(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        value = value.strip()
        return value or None


class LoginRequest(_StrictModel):
    email: str = Field(min_length=3, max_length=320)
    password: str = Field(min_length=1, max_length=128)
    device_id: Optional[str] = Field(default=None, max_length=128)
    device_name: Optional[str] = Field(default=None, max_length=128)

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        return normalize_email(value)


class RefreshRequest(_StrictModel):
    refresh_token: str = Field(min_length=32, max_length=512)


class TokenPairOut(BaseModel):
    access_token: str
    refresh_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_in: int
    refresh_expires_in: int


class UserOut(BaseModel):
    user_id: int
    email: Optional[str] = None
    nickname: Optional[str] = None
    created_at: datetime


class AuthResponse(BaseModel):
    user: UserOut
    tokens: TokenPairOut


ConsentType = Literal[
    "terms",
    "privacy",
    "health_disclaimer",
    "ai_processing",
]


class ConsentDecision(_StrictModel):
    consent_type: ConsentType
    version: str = Field(min_length=1, max_length=32)
    accepted: bool


class ConsentUpdateRequest(_StrictModel):
    consents: list[ConsentDecision] = Field(min_length=1, max_length=4)
    app_version: Optional[str] = Field(default=None, max_length=32)

    @model_validator(mode="after")
    def reject_duplicate_types(self) -> "ConsentUpdateRequest":
        types = [item.consent_type for item in self.consents]
        if len(types) != len(set(types)):
            raise ValueError("duplicate consent_type")
        return self


class ConsentStatusOut(BaseModel):
    consent_type: ConsentType
    version: str
    accepted: bool
    accepted_at: Optional[datetime] = None


class DeleteAccountRequest(_StrictModel):
    password: str = Field(min_length=1, max_length=128)
