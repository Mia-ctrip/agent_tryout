from __future__ import annotations

from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, Response, UploadFile, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.product_catalog import StandardProductDetailOut
from app.services import dev_catalog_service, product_search_service
from app.services.product_image_service import validate_product_image


dev_catalog_router = APIRouter(
    prefix="/dev/catalog",
    tags=["development-catalog"],
)


@dev_catalog_router.post(
    "/products",
    response_model=StandardProductDetailOut,
    status_code=status.HTTP_201_CREATED,
    summary="临时录入标准化妆品",
    description=(
        "仅在 APP_ENV=dev 挂载且无需登录。用于本地体验：上传产品图并填写化妆品字段，"
        "服务端自动生成目录编号和技术元数据。药品与医疗器械不得使用此入口。"
    ),
)
async def create_development_catalog_product_endpoint(
    response: Response,
    brand_name: str = Form(..., max_length=120),
    official_name: str = Form(..., max_length=180),
    product_category: str = Form(..., max_length=64),
    formula_version: str = Form(..., max_length=120),
    market_region: str = Form(default="CN", max_length=16),
    concentration: str | None = Form(
        default=None,
        max_length=80,
        description="浓度或规格，例如 2% 水杨酸、30 mL",
    ),
    instructions: str | None = Form(
        default=None,
        max_length=5000,
        description="说明书原文；填写后会作为当前产品资料显示",
    ),
    search_keywords: str | None = Form(
        default=None,
        max_length=2000,
        description="搜索关键词：用逗号、分号或换行分隔",
    ),
    file: UploadFile = File(..., description="产品正面图（JPEG、PNG 或 WebP）"),
    db: Session = Depends(get_db),
) -> StandardProductDetailOut:
    client_request_id = uuid4()
    existing = dev_catalog_service.get_product_for_request(
        db,
        client_request_id=client_request_id,
    )
    if existing is not None:
        response.status_code = status.HTTP_200_OK
        return product_search_service.get_standard_product_detail(
            db,
            user_id=0,
            standard_product_id=existing.id,
        )

    image = validate_product_image(await file.read(), file.content_type or "")
    product, created = dev_catalog_service.create_cosmetic_product(
        db,
        client_request_id=client_request_id,
        brand_name=brand_name,
        official_name=official_name,
        product_category=product_category,
        formula_version=formula_version,
        market_region=market_region,
        key_strength=concentration,
        instructions=instructions,
        search_keywords=search_keywords,
        image=image,
    )
    response.status_code = status.HTTP_201_CREATED if created else status.HTTP_200_OK
    return product_search_service.get_standard_product_detail(
        db,
        user_id=0,
        standard_product_id=product.id,
    )
