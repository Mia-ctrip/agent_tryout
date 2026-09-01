from __future__ import annotations

from datetime import datetime
from uuid import UUID

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    Form,
    Query,
    Response,
    UploadFile,
    HTTPException,
    status,
)
from pydantic import TypeAdapter, ValidationError
from sqlalchemy.orm import Session

from app.api.deps import get_current_app_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.observation import (
    ObservationLifeContextUpdate,
    ObservationNoteUpdate,
    ObservationOut,
    RegionTargetCreate,
)
from app.schemas.observation_quality import ObservationQualityOut
from app.services import observation_service
from app.services import observation_quality_service
from app.services.observation_worker import run_observation_target
from app.services.region_event_service import activate_valid_target_event


router = APIRouter(prefix="/observations", tags=["observations"])
_REGION_TARGETS_ADAPTER = TypeAdapter(list[RegionTargetCreate])


def _parse_region_targets(value: str) -> list[RegionTargetCreate]:
    try:
        return _REGION_TARGETS_ADAPTER.validate_json(value)
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail="invalid region targets") from exc


@router.post("/photo-quality", response_model=ObservationQualityOut)
async def check_observation_photo_quality_endpoint(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_app_user),
) -> ObservationQualityOut:
    del current_user
    data = await file.read()
    observation_service.validate_photo_input(
        observation_service.ObservationPhotoInput(
            data=data,
            mime_type=file.content_type or "",
        )
    )
    return observation_quality_service.assess_observation_photo(data)


@router.post("", response_model=ObservationOut, status_code=status.HTTP_201_CREATED)
async def create_observation_endpoint(
    response: Response,
    background_tasks: BackgroundTasks,
    client_request_id: UUID = Form(...),
    recorded_at: datetime = Form(...),
    recorded_timezone_offset_minutes: int = Form(...),
    targets_json: str = Form(...),
    taken_at: datetime | None = Form(default=None),
    file: UploadFile | None = File(default=None),
    current_user: User = Depends(get_current_app_user),
    db: Session = Depends(get_db),
) -> ObservationOut:
    existing = observation_service.find_observation_by_request(
        db, current_user.id, client_request_id
    )
    if existing is not None:
        response.status_code = status.HTTP_200_OK
        targets = observation_service.load_observation_targets(db, existing.id)
        return observation_service.to_observation_out(db, existing, targets)

    target_inputs = _parse_region_targets(targets_json)

    photo_input = None
    if file is not None:
        data = await file.read()
        photo_input = observation_service.ObservationPhotoInput(
            data=data,
            mime_type=file.content_type or "",
            taken_at=taken_at,
        )

    record, targets, created = observation_service.create_observation(
        db,
        user_id=current_user.id,
        client_request_id=client_request_id,
        recorded_at=recorded_at,
        recorded_timezone_offset_minutes=recorded_timezone_offset_minutes,
        target_inputs=target_inputs,
        photo_input=photo_input,
    )
    response.status_code = status.HTTP_201_CREATED if created else status.HTTP_200_OK
    if created and record.photo_id is not None:
        for target in targets:
            background_tasks.add_task(run_observation_target, target.id)
    elif created:
        for target in targets:
            activate_valid_target_event(db, target.id)
    return observation_service.to_observation_out(db, record, targets)


@router.get("", response_model=list[ObservationOut])
def list_observation_endpoint(
    limit: int = Query(default=30, ge=1),
    before_id: int | None = Query(default=None, ge=1),
    current_user: User = Depends(get_current_app_user),
    db: Session = Depends(get_db),
) -> list[ObservationOut]:
    return observation_service.list_observations(
        db,
        user_id=current_user.id,
        limit=limit,
        before_id=before_id,
    )


@router.get("/{observation_id}", response_model=ObservationOut)
def get_observation_endpoint(
    observation_id: int,
    current_user: User = Depends(get_current_app_user),
    db: Session = Depends(get_db),
) -> ObservationOut:
    return observation_service.get_observation_out(
        db,
        user_id=current_user.id,
        observation_id=observation_id,
    )


@router.put("/{observation_id}/targets/{target_id}/note", response_model=ObservationOut)
def replace_observation_note_endpoint(
    observation_id: int,
    target_id: int,
    body: ObservationNoteUpdate,
    current_user: User = Depends(get_current_app_user),
    db: Session = Depends(get_db),
) -> ObservationOut:
    return observation_service.replace_failed_observation_note(
        db,
        user_id=current_user.id,
        observation_id=observation_id,
        target_id=target_id,
        user_note=body.user_note,
    )


@router.post("/{observation_id}/targets/{target_id}/retry", response_model=ObservationOut)
def retry_observation_target_endpoint(
    observation_id: int,
    target_id: int,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_app_user),
    db: Session = Depends(get_db),
) -> ObservationOut:
    record, targets, started = observation_service.retry_failed_observation_target(
        db,
        user_id=current_user.id,
        observation_id=observation_id,
        target_id=target_id,
    )
    if started:
        background_tasks.add_task(run_observation_target, target_id)
    del record, targets
    return observation_service.get_observation_out(
        db,
        user_id=current_user.id,
        observation_id=observation_id,
    )


@router.put("/{observation_id}/life-contexts", response_model=ObservationOut)
def replace_observation_life_contexts_endpoint(
    observation_id: int,
    body: ObservationLifeContextUpdate,
    current_user: User = Depends(get_current_app_user),
    db: Session = Depends(get_db),
) -> ObservationOut:
    return observation_service.replace_life_contexts(
        db,
        user_id=current_user.id,
        observation_id=observation_id,
        context_ids=body.context_ids,
    )
