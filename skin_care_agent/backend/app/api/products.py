from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, Query, Response, UploadFile, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_app_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.product import (
    ProductCreate,
    ProductDetailOut,
    ProductOut,
    ProductUseCreate,
    ProductUseOut,
)
from app.schemas.product_catalog import ProductFromStandardCreate
from app.services import product_service
from app.services.product_image_service import validate_product_image


products_router = APIRouter(prefix="/products", tags=["products"])
product_uses_router = APIRouter(prefix="/product-uses", tags=["product-uses"])

# TODO(product-archive): add an authenticated soft-archive endpoint and exclude archived
# personal products from cabinet/search selection while preserving historical use snapshots.


@products_router.post(
    "/from-standard",
    response_model=ProductOut,
    status_code=status.HTTP_201_CREATED,
)
def add_standard_product_endpoint(
    body: ProductFromStandardCreate,
    response: Response,
    current_user: User = Depends(get_current_app_user),
    db: Session = Depends(get_db),
) -> ProductOut:
    product, created = product_service.add_standard_product_to_cabinet(
        db,
        user_id=current_user.id,
        client_request_id=body.client_request_id,
        standard_product_id=body.standard_product_id,
        display_name_override=body.display_name_override,
    )
    response.status_code = status.HTTP_201_CREATED if created else status.HTTP_200_OK
    return product_service._product_out(db, product)


@products_router.post("", response_model=ProductOut, status_code=status.HTTP_201_CREATED)
def create_product_endpoint(
    body: ProductCreate,
    response: Response,
    current_user: User = Depends(get_current_app_user),
    db: Session = Depends(get_db),
) -> ProductOut:
    product, created = product_service.create_product(
        db,
        user_id=current_user.id,
        client_request_id=body.client_request_id,
        name=body.name,
    )
    response.status_code = status.HTTP_201_CREATED if created else status.HTTP_200_OK
    return product


@products_router.post("/custom", response_model=ProductOut, status_code=status.HTTP_201_CREATED)
async def create_custom_product_endpoint(
    response: Response,
    client_request_id: UUID = Form(...),
    name: str = Form(...),
    file: UploadFile | None = File(default=None),
    current_user: User = Depends(get_current_app_user),
    db: Session = Depends(get_db),
) -> ProductOut:
    existing = product_service.get_product_for_request(
        db,
        user_id=current_user.id,
        client_request_id=client_request_id,
    )
    if existing is not None:
        response.status_code = status.HTTP_200_OK
        return existing

    image = None
    if file is not None:
        image = validate_product_image(await file.read(), file.content_type or "")
    product, created = product_service.create_custom_product(
        db,
        user_id=current_user.id,
        client_request_id=client_request_id,
        name=name,
        image=image,
    )
    response.status_code = status.HTTP_201_CREATED if created else status.HTTP_200_OK
    return product


@products_router.get("", response_model=list[ProductOut])
def list_products_endpoint(
    current_user: User = Depends(get_current_app_user),
    db: Session = Depends(get_db),
) -> list[ProductOut]:
    return product_service.list_products(db, user_id=current_user.id)


@products_router.get("/{product_id}", response_model=ProductDetailOut)
def get_product_endpoint(
    product_id: int,
    current_user: User = Depends(get_current_app_user),
    db: Session = Depends(get_db),
) -> ProductDetailOut:
    return product_service.get_product_detail(
        db,
        user_id=current_user.id,
        product_id=product_id,
    )


@product_uses_router.post("", response_model=ProductUseOut, status_code=status.HTTP_201_CREATED)
def create_product_use_endpoint(
    body: ProductUseCreate,
    response: Response,
    current_user: User = Depends(get_current_app_user),
    db: Session = Depends(get_db),
) -> ProductUseOut:
    product_use, created = product_service.create_product_use(
        db,
        user_id=current_user.id,
        client_request_id=body.client_request_id,
        used_at=body.used_at,
        used_timezone_offset_minutes=body.used_timezone_offset_minutes,
        product_ids=body.product_ids,
        note=body.note,
    )
    response.status_code = status.HTTP_201_CREATED if created else status.HTTP_200_OK
    return product_use


@product_uses_router.get("", response_model=list[ProductUseOut])
def list_product_uses_endpoint(
    limit: int = Query(default=50, ge=1, le=100),
    before_id: int | None = Query(default=None, ge=1),
    current_user: User = Depends(get_current_app_user),
    db: Session = Depends(get_db),
) -> list[ProductUseOut]:
    return product_service.list_product_uses(
        db,
        user_id=current_user.id,
        limit=limit,
        before_id=before_id,
    )


@product_uses_router.get("/{use_id}", response_model=ProductUseOut)
def get_product_use_endpoint(
    use_id: int,
    current_user: User = Depends(get_current_app_user),
    db: Session = Depends(get_db),
) -> ProductUseOut:
    return product_service.get_product_use(db, user_id=current_user.id, use_id=use_id)
