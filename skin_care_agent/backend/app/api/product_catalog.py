from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import get_current_app_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.product_catalog import ProductSearchPageOut, StandardProductDetailOut
from app.services import product_search_service


catalog_router = APIRouter(tags=["product-catalog"])


@catalog_router.get("/product-search", response_model=ProductSearchPageOut)
def search_products_endpoint(
    q: str = Query(min_length=1, max_length=120),
    limit: int = Query(default=20, ge=1, le=50),
    cursor: str | None = Query(default=None),
    current_user: User = Depends(get_current_app_user),
    db: Session = Depends(get_db),
) -> ProductSearchPageOut:
    return product_search_service.search_product_options(
        db,
        user_id=current_user.id,
        query=q,
        limit=limit,
        cursor=cursor,
    )


@catalog_router.get(
    "/catalog/products/{standard_product_id}",
    response_model=StandardProductDetailOut,
)
def get_standard_product_endpoint(
    standard_product_id: int,
    current_user: User = Depends(get_current_app_user),
    db: Session = Depends(get_db),
) -> StandardProductDetailOut:
    return product_search_service.get_standard_product_detail(
        db,
        user_id=current_user.id,
        standard_product_id=standard_product_id,
    )
