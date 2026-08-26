from __future__ import annotations

import csv
import hashlib
import json
import unicodedata
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Annotated, Any

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field, StringConstraints, ValidationError, field_validator
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.product_catalog import (
    REGULATORY_TYPES,
    STANDARD_PRODUCT_STATUSES,
    CatalogImportBatch,
    ProductAssetCleanup,
    ProductImageAsset,
    StandardProduct,
    StandardProductAlias,
    StandardProductDocument,
)
from app.services.product_image_service import ValidatedProductImage, validate_product_image
from app.services.storage_service.base import StorageBackend


RequiredText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]
Sha256Text = Annotated[str, StringConstraints(pattern=r"^[0-9a-fA-F]{64}$")]


def _blank_to_none(value: object) -> object:
    if isinstance(value, str) and not value.strip():
        return None
    return value


class CatalogManifest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    catalog_version: RequiredText
    generated_at: datetime
    products_file: RequiredText
    aliases_file: RequiredText
    documents_file: RequiredText

    @field_validator("generated_at")
    @classmethod
    def require_generated_at_timezone(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("generated_at must include a timezone")
        return value


class CatalogProductInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    catalog_code: Annotated[RequiredText, StringConstraints(max_length=96)]
    brand_name: Annotated[RequiredText, StringConstraints(max_length=120)]
    official_name: Annotated[RequiredText, StringConstraints(max_length=180)]
    product_category: Annotated[RequiredText, StringConstraints(max_length=64)]
    formula_version: Annotated[RequiredText, StringConstraints(max_length=120)]
    key_strength: Annotated[str, StringConstraints(strip_whitespace=True, max_length=80)] | None
    regulatory_type: RequiredText
    registration_number: (
        Annotated[str, StringConstraints(strip_whitespace=True, max_length=120)] | None
    )
    market_region: Annotated[RequiredText, StringConstraints(max_length=16)]
    status: RequiredText
    primary_image_path: str
    primary_image_mime_type: RequiredText
    primary_image_sha256: Sha256Text

    @field_validator("key_strength", "registration_number", mode="before")
    @classmethod
    def normalize_optional_text(cls, value: object) -> object:
        return _blank_to_none(value)

    @field_validator("primary_image_path")
    @classmethod
    def require_primary_image(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("primary image is required")
        return normalized

    @field_validator("regulatory_type")
    @classmethod
    def require_supported_regulatory_type(cls, value: str) -> str:
        if value not in REGULATORY_TYPES:
            raise ValueError("unsupported regulatory_type")
        return value

    @field_validator("status")
    @classmethod
    def require_supported_status(cls, value: str) -> str:
        if value not in STANDARD_PRODUCT_STATUSES:
            raise ValueError("unsupported product status")
        return value

    @field_validator("primary_image_sha256")
    @classmethod
    def normalize_image_sha256(cls, value: str) -> str:
        return value.lower()


class CatalogAliasInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    catalog_code: Annotated[RequiredText, StringConstraints(max_length=96)]
    alias: Annotated[RequiredText, StringConstraints(max_length=240)]
    language: Annotated[str, StringConstraints(strip_whitespace=True, max_length=16)] | None

    @field_validator("language", mode="before")
    @classmethod
    def normalize_optional_language(cls, value: object) -> object:
        return _blank_to_none(value)


class CatalogDocumentInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    catalog_code: Annotated[RequiredText, StringConstraints(max_length=96)]
    market_region: Annotated[RequiredText, StringConstraints(max_length=16)]
    language: Annotated[RequiredText, StringConstraints(max_length=16)]
    document_version: Annotated[RequiredText, StringConstraints(max_length=120)]
    effective_date: date | None
    registration_number: (
        Annotated[str, StringConstraints(strip_whitespace=True, max_length=120)] | None
    )
    source_name: str | None
    source_url: str | None
    indications_original_text: str | None
    source_document_path: str | None
    content_sha256: Sha256Text
    is_current: bool

    @field_validator(
        "effective_date",
        "registration_number",
        "source_name",
        "source_url",
        "indications_original_text",
        "source_document_path",
        mode="before",
    )
    @classmethod
    def normalize_optional_fields(cls, value: object) -> object:
        return _blank_to_none(value)

    @field_validator("source_name")
    @classmethod
    def limit_source_name(cls, value: str | None) -> str | None:
        if value is not None and len(value) > 180:
            raise ValueError("source_name must be at most 180 characters")
        return value.strip() if value is not None else None

    @field_validator("source_url")
    @classmethod
    def limit_source_url(cls, value: str | None) -> str | None:
        if value is not None and len(value) > 512:
            raise ValueError("source_url must be at most 512 characters")
        return value.strip() if value is not None else None

    @field_validator("source_document_path")
    @classmethod
    def normalize_document_path(cls, value: str | None) -> str | None:
        return value.strip() if value is not None else None

    @field_validator("content_sha256")
    @classmethod
    def normalize_content_sha256(cls, value: str) -> str:
        return value.lower()


@dataclass(frozen=True)
class ValidatedCatalogImage:
    catalog_code: str
    relative_path: str
    image: ValidatedProductImage


@dataclass(frozen=True)
class ValidatedCatalogDocumentAsset:
    catalog_code: str
    relative_path: str
    data: bytes
    sha256: str


@dataclass(frozen=True)
class ValidatedCatalogPackage:
    source: Path
    manifest: CatalogManifest
    manifest_sha256: str
    products: tuple[CatalogProductInput, ...]
    aliases: tuple[CatalogAliasInput, ...]
    documents: tuple[CatalogDocumentInput, ...]
    images: tuple[ValidatedCatalogImage, ...]
    document_assets: tuple[ValidatedCatalogDocumentAsset, ...]


@dataclass(frozen=True)
class StagedCatalogAsset:
    key: str
    asset_type: str
    data: bytes
    content_type: str


class CatalogCleanupRegistrationError(RuntimeError):
    def __init__(self, cleanup_keys: Iterable[str]):
        self.cleanup_keys = tuple(sorted(set(cleanup_keys)))
        joined_keys = ", ".join(self.cleanup_keys)
        super().__init__(f"catalog cleanup registration failed for keys: {joined_keys}")


class ImportReport(BaseModel):
    model_config = ConfigDict(extra="forbid")

    valid: bool
    catalog_version: str
    products: int = Field(ge=0)
    aliases: int = Field(ge=0)
    documents: int = Field(ge=0)
    images: int = Field(ge=0)
    errors: list[str] = Field(default_factory=list)
    batch_id: int | None = Field(default=None, exclude=True)

    @property
    def persisted_counts(self) -> dict[str, int]:
        return {
            "products": self.products,
            "aliases": self.aliases,
            "documents": self.documents,
            "images": self.images,
        }


def normalize_product_search_text(value: str) -> str:
    normalized = unicodedata.normalize("NFKC", value).casefold().strip()
    return "".join(character for character in normalized if character.isalnum())


def _package_fingerprint(
    manifest: CatalogManifest,
    products: tuple[CatalogProductInput, ...],
    aliases: tuple[CatalogAliasInput, ...],
    documents: tuple[CatalogDocumentInput, ...],
) -> str:
    payload = {
        "manifest": manifest.model_dump(mode="json"),
        "products": [
            product.model_dump(mode="json")
            for product in sorted(products, key=lambda item: item.catalog_code)
        ],
        "aliases": [
            alias.model_dump(mode="json")
            for alias in sorted(
                aliases,
                key=lambda item: (
                    item.catalog_code,
                    normalize_product_search_text(item.alias),
                    item.alias,
                    item.language or "",
                ),
            )
        ],
        "documents": [
            document.model_dump(mode="json")
            for document in sorted(
                documents,
                key=lambda item: (
                    item.catalog_code,
                    item.market_region,
                    item.language,
                    item.document_version,
                ),
            )
        ],
    }
    encoded = json.dumps(
        payload,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def _validation_error(context: str, error: ValidationError) -> ValueError:
    details: list[str] = []
    for item in error.errors(include_url=False, include_context=False, include_input=False):
        location = ".".join(str(part) for part in item["loc"])
        details.append(f"{location}: {item['msg']}")
    return ValueError(f"invalid {context}: {'; '.join(details)}")


def _resolve_package_file(package_root: Path, relative_path: str, *, label: str) -> Path:
    raw_path = Path(relative_path)
    if raw_path.is_absolute():
        raise ValueError(f"{label} path must stay inside catalog package")
    resolved = (package_root / raw_path).resolve()
    try:
        resolved.relative_to(package_root)
    except ValueError as exc:
        raise ValueError(f"{label} path must stay inside catalog package") from exc
    if not resolved.is_file():
        raise ValueError(f"{label} file not found")
    return resolved


def _load_csv_rows(path: Path, model_type: type[BaseModel], *, label: str) -> tuple[Any, ...]:
    with path.open(encoding="utf-8-sig", newline="") as source:
        reader = csv.DictReader(source)
        if reader.fieldnames is None:
            raise ValueError(f"{label} CSV header is required")
        rows: list[Any] = []
        for row_number, row in enumerate(reader, start=2):
            if None in row:
                raise ValueError(f"invalid {label} row {row_number}: unexpected CSV values")
            try:
                rows.append(model_type.model_validate(row))
            except ValidationError as exc:
                raise _validation_error(f"{label} row {row_number}", exc) from exc
    return tuple(rows)


def _validate_products(
    package_root: Path,
    products: tuple[CatalogProductInput, ...],
) -> tuple[dict[str, CatalogProductInput], tuple[ValidatedCatalogImage, ...]]:
    products_by_code: dict[str, CatalogProductInput] = {}
    images: list[ValidatedCatalogImage] = []
    for product in products:
        normalized_brand_name = normalize_product_search_text(product.brand_name)
        normalized_official_name = normalize_product_search_text(product.official_name)
        if not normalized_brand_name:
            raise ValueError("brand_name must contain searchable characters")
        if not normalized_official_name:
            raise ValueError("official_name must contain searchable characters")
        if len(normalized_brand_name) > 180:
            raise ValueError("normalized brand_name exceeds 180 characters")
        if len(normalized_official_name) > 240:
            raise ValueError("normalized official_name exceeds 240 characters")
        if product.catalog_code in products_by_code:
            raise ValueError(f"duplicate catalog_code: {product.catalog_code}")
        products_by_code[product.catalog_code] = product
        image_path = _resolve_package_file(
            package_root,
            product.primary_image_path,
            label="primary image",
        )
        image_bytes = image_path.read_bytes()
        if hashlib.sha256(image_bytes).hexdigest() != product.primary_image_sha256:
            raise ValueError(f"primary image sha256 mismatch: {product.catalog_code}")
        try:
            image = validate_product_image(image_bytes, product.primary_image_mime_type)
        except HTTPException as exc:
            raise ValueError(f"invalid primary image for {product.catalog_code}: {exc.detail}") from exc
        images.append(
            ValidatedCatalogImage(
                catalog_code=product.catalog_code,
                relative_path=product.primary_image_path,
                image=image,
            )
        )
    return products_by_code, tuple(images)


def _validate_aliases(
    aliases: tuple[CatalogAliasInput, ...],
    products_by_code: dict[str, CatalogProductInput],
) -> None:
    seen: set[tuple[str, str]] = set()
    for alias in aliases:
        if alias.catalog_code not in products_by_code:
            raise ValueError(f"alias references unknown catalog_code: {alias.catalog_code}")
        normalized_alias = normalize_product_search_text(alias.alias)
        if not normalized_alias:
            raise ValueError("alias must contain searchable characters")
        if len(normalized_alias) > 240:
            raise ValueError("normalized alias exceeds 240 characters")
        key = (alias.catalog_code, normalized_alias)
        if key in seen:
            raise ValueError(f"duplicate normalized alias: {alias.catalog_code}")
        seen.add(key)


def _document_content(
    package_root: Path,
    document: CatalogDocumentInput,
) -> tuple[bytes, ValidatedCatalogDocumentAsset | None]:
    if document.source_document_path is not None:
        source_path = _resolve_package_file(
            package_root,
            document.source_document_path,
            label="source document",
        )
        data = source_path.read_bytes()
        return data, ValidatedCatalogDocumentAsset(
            catalog_code=document.catalog_code,
            relative_path=document.source_document_path,
            data=data,
            sha256=document.content_sha256,
        )
    if document.indications_original_text is None:
        raise ValueError(f"document content is required: {document.catalog_code}")
    return document.indications_original_text.encode("utf-8"), None


def _validate_documents(
    package_root: Path,
    documents: tuple[CatalogDocumentInput, ...],
    products_by_code: dict[str, CatalogProductInput],
) -> tuple[ValidatedCatalogDocumentAsset, ...]:
    version_keys: set[tuple[str, str, str, str]] = set()
    current_keys: set[tuple[str, str, str]] = set()
    documented_product_codes: set[str] = set()
    assets: list[ValidatedCatalogDocumentAsset] = []
    for document in documents:
        product = products_by_code.get(document.catalog_code)
        if product is None:
            raise ValueError(f"document references unknown catalog_code: {document.catalog_code}")
        if not document.source_name or not document.source_url:
            raise ValueError(f"official document source is required: {document.catalog_code}")
        version_key = (
            document.catalog_code,
            document.market_region,
            document.language,
            document.document_version,
        )
        if version_key in version_keys:
            raise ValueError(f"duplicate document version: {document.catalog_code}")
        version_keys.add(version_key)
        if document.is_current:
            current_key = (
                document.catalog_code,
                document.market_region,
                document.language,
            )
            if current_key in current_keys:
                raise ValueError(f"multiple current documents: {document.catalog_code}")
            current_keys.add(current_key)
        content, asset = _document_content(package_root, document)
        if hashlib.sha256(content).hexdigest() != document.content_sha256:
            raise ValueError(f"document sha256 mismatch: {document.catalog_code}")
        if asset is not None:
            assets.append(asset)
        documented_product_codes.add(document.catalog_code)

    for product in products_by_code.values():
        if (
            product.status == "active"
            and product.regulatory_type in {"drug", "medical_device"}
            and product.catalog_code not in documented_product_codes
        ):
            raise ValueError(f"official document source is required: {product.catalog_code}")
    return tuple(assets)


def validate_catalog_package(source: Path) -> ValidatedCatalogPackage:
    package_root = source.resolve()
    if not package_root.is_dir():
        raise ValueError("catalog package directory not found")
    manifest_path = _resolve_package_file(package_root, "manifest.json", label="manifest")
    manifest_bytes = manifest_path.read_bytes()
    try:
        manifest_payload = json.loads(manifest_bytes.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ValueError("invalid manifest JSON") from exc
    try:
        manifest = CatalogManifest.model_validate(manifest_payload)
    except ValidationError as exc:
        raise _validation_error("manifest", exc) from exc

    products_path = _resolve_package_file(
        package_root,
        manifest.products_file,
        label="products",
    )
    aliases_path = _resolve_package_file(package_root, manifest.aliases_file, label="aliases")
    documents_path = _resolve_package_file(
        package_root,
        manifest.documents_file,
        label="documents",
    )
    products = _load_csv_rows(products_path, CatalogProductInput, label="product")
    aliases = _load_csv_rows(aliases_path, CatalogAliasInput, label="alias")
    documents = _load_csv_rows(documents_path, CatalogDocumentInput, label="document")
    products_by_code, images = _validate_products(package_root, products)
    _validate_aliases(aliases, products_by_code)
    document_assets = _validate_documents(package_root, documents, products_by_code)
    return ValidatedCatalogPackage(
        source=package_root,
        manifest=manifest,
        manifest_sha256=_package_fingerprint(manifest, products, aliases, documents),
        products=products,
        aliases=aliases,
        documents=documents,
        images=images,
        document_assets=document_assets,
    )


def _document_storage_suffix(relative_path: str) -> str:
    suffix = Path(relative_path).suffix.lower()
    if 1 < len(suffix) <= 16 and suffix[1:].isalnum():
        return suffix
    return ".bin"


def _catalog_image_storage_key(image: ValidatedProductImage) -> str:
    return f"product-images/catalog/{image.sha256[:2]}/{image.sha256}.{image.extension}"


def _catalog_document_storage_key(document: ValidatedCatalogDocumentAsset) -> str:
    suffix = _document_storage_suffix(document.relative_path)
    return f"product-documents/catalog/{document.sha256[:2]}/{document.sha256}{suffix}"


def stage_catalog_assets(
    storage: StorageBackend,
    package: ValidatedCatalogPackage,
) -> tuple[StagedCatalogAsset, ...]:
    assets_by_key: dict[str, StagedCatalogAsset] = {}
    for catalog_image in package.images:
        image = catalog_image.image
        key = _catalog_image_storage_key(image)
        assets_by_key.setdefault(
            key,
            StagedCatalogAsset(
                key=key,
                asset_type="image",
                data=image.data,
                content_type=image.mime_type,
            ),
        )
    for document in package.document_assets:
        key = _catalog_document_storage_key(document)
        assets_by_key.setdefault(
            key,
            StagedCatalogAsset(
                key=key,
                asset_type="document",
                data=document.data,
                content_type="application/octet-stream",
            ),
        )

    staged = tuple(assets_by_key.values())
    for asset in staged:
        if storage.exists(asset.key):
            try:
                existing_data = storage.get(asset.key)
            except FileNotFoundError as exc:
                raise ValueError("existing catalog asset became unavailable") from exc
            if hashlib.sha256(existing_data).digest() != hashlib.sha256(asset.data).digest():
                raise ValueError("existing catalog asset hash mismatch")
            continue
        storage.put(asset.key, asset.data, asset.content_type)
    return staged


def _find_import_batch(
    db: Session,
    catalog_version: str,
    manifest_sha256: str,
) -> CatalogImportBatch | None:
    return db.scalar(
        select(CatalogImportBatch).where(
            CatalogImportBatch.catalog_version == catalog_version,
            CatalogImportBatch.manifest_sha256 == manifest_sha256,
            CatalogImportBatch.deleted_at.is_(None),
        )
    )


def _report_for_batch(
    batch: CatalogImportBatch,
    package: ValidatedCatalogPackage,
) -> ImportReport:
    return ImportReport(
        valid=True,
        catalog_version=package.manifest.catalog_version,
        products=len(package.products),
        aliases=len(package.aliases),
        documents=len(package.documents),
        images=len(package.images),
        errors=[],
        batch_id=batch.id,
    )


def _persist_catalog_transaction(
    db: Session,
    package: ValidatedCatalogPackage,
    staged: tuple[StagedCatalogAsset, ...],
) -> CatalogImportBatch:
    staged_keys = {asset.key for asset in staged}
    required_keys = {
        *(_catalog_image_storage_key(image.image) for image in package.images),
        *(_catalog_document_storage_key(document) for document in package.document_assets),
    }
    if not required_keys <= staged_keys:
        raise RuntimeError("validated catalog assets were not fully staged")
    batch = CatalogImportBatch(
        catalog_version=package.manifest.catalog_version,
        manifest_sha256=package.manifest_sha256,
        source_name=package.source.name,
    )
    db.add(batch)
    db.flush()

    image_assets_by_key: dict[str, ProductImageAsset] = {}
    for catalog_image in package.images:
        image = catalog_image.image
        storage_key = _catalog_image_storage_key(image)
        asset = image_assets_by_key.get(storage_key)
        if asset is None:
            asset = db.scalar(
                select(ProductImageAsset).where(ProductImageAsset.storage_key == storage_key)
            )
        if asset is None:
            asset = ProductImageAsset(
                storage_key=storage_key,
                mime_type=image.mime_type,
                byte_size=len(image.data),
                width=image.width,
                height=image.height,
                sha256=image.sha256,
                source_type="catalog",
                owner_user_id=None,
            )
            db.add(asset)
            db.flush()
        image_assets_by_key[storage_key] = asset

    products_by_code: dict[str, StandardProduct] = {}
    images_by_code = {item.catalog_code: item.image for item in package.images}
    for product_input in package.products:
        image = images_by_code[product_input.catalog_code]
        product = db.scalar(
            select(StandardProduct).where(
                StandardProduct.catalog_code == product_input.catalog_code
            )
        )
        if product is None:
            product = StandardProduct(catalog_code=product_input.catalog_code)
            db.add(product)
        product.brand_name = product_input.brand_name
        product.official_name = product_input.official_name
        product.normalized_brand_name = normalize_product_search_text(product_input.brand_name)
        product.normalized_official_name = normalize_product_search_text(
            product_input.official_name
        )
        product.product_category = product_input.product_category
        product.formula_version = product_input.formula_version
        product.key_strength = product_input.key_strength
        product.regulatory_type = product_input.regulatory_type
        product.registration_number = product_input.registration_number
        product.market_region = product_input.market_region
        product.primary_image_asset_id = image_assets_by_key[
            _catalog_image_storage_key(image)
        ].id
        product.status = product_input.status
        product.import_batch_id = batch.id
        product.deleted_at = None
        db.flush()
        products_by_code[product.catalog_code] = product

    aliases_by_code: dict[str, list[CatalogAliasInput]] = {}
    for alias_input in package.aliases:
        aliases_by_code.setdefault(alias_input.catalog_code, []).append(alias_input)
    archived_at = datetime.now(timezone.utc)
    for catalog_code, product in products_by_code.items():
        existing_aliases = db.scalars(
            select(StandardProductAlias).where(
                StandardProductAlias.standard_product_id == product.id
            )
        ).all()
        existing_by_normalized = {
            alias.normalized_alias: alias for alias in existing_aliases
        }
        current_normalized: set[str] = set()
        for alias_input in aliases_by_code.get(catalog_code, []):
            normalized_alias = normalize_product_search_text(alias_input.alias)
            current_normalized.add(normalized_alias)
            alias = existing_by_normalized.get(normalized_alias)
            if alias is None:
                alias = StandardProductAlias(
                    standard_product_id=product.id,
                    normalized_alias=normalized_alias,
                )
                db.add(alias)
            alias.alias = alias_input.alias
            alias.language = alias_input.language
            alias.import_batch_id = batch.id
            alias.deleted_at = None
        for normalized_alias, alias in existing_by_normalized.items():
            if normalized_alias not in current_normalized and alias.deleted_at is None:
                alias.deleted_at = archived_at

    document_assets_by_code_and_path = {
        (asset.catalog_code, asset.relative_path): asset for asset in package.document_assets
    }
    products_input_by_code = {product.catalog_code: product for product in package.products}
    current_document_scopes = {
        (
            products_by_code[document.catalog_code].id,
            document.market_region,
            document.language,
        )
        for document in package.documents
        if document.is_current
    }
    for standard_product_id, market_region, language in current_document_scopes:
        existing_current_documents = db.scalars(
            select(StandardProductDocument).where(
                StandardProductDocument.standard_product_id == standard_product_id,
                StandardProductDocument.market_region == market_region,
                StandardProductDocument.language == language,
                StandardProductDocument.is_current.is_(True),
            )
        ).all()
        for existing_current in existing_current_documents:
            existing_current.is_current = False
            existing_current.archived_at = archived_at
    db.flush()

    for document_input in package.documents:
        standard_product = products_by_code[document_input.catalog_code]
        source_document_storage_key = None
        if document_input.source_document_path is not None:
            document_asset = document_assets_by_code_and_path[
                (document_input.catalog_code, document_input.source_document_path)
            ]
            source_document_storage_key = _catalog_document_storage_key(document_asset)
        document = db.scalar(
            select(StandardProductDocument).where(
                StandardProductDocument.standard_product_id == standard_product.id,
                StandardProductDocument.market_region == document_input.market_region,
                StandardProductDocument.language == document_input.language,
                StandardProductDocument.document_version == document_input.document_version,
            )
        )
        if document is None:
            document = StandardProductDocument(
                standard_product_id=standard_product.id,
                market_region=document_input.market_region,
                language=document_input.language,
                regulatory_type=products_input_by_code[
                    document_input.catalog_code
                ].regulatory_type,
                document_version=document_input.document_version,
                effective_date=document_input.effective_date,
                registration_number=document_input.registration_number,
                source_name=document_input.source_name,
                source_url=document_input.source_url,
                indications_original_text=document_input.indications_original_text,
                source_document_storage_key=source_document_storage_key,
                content_sha256=document_input.content_sha256,
                is_current=document_input.is_current,
                import_batch_id=batch.id,
            )
            db.add(document)
        else:
            immutable_existing = (
                document.regulatory_type,
                document.effective_date,
                document.registration_number,
                document.source_name,
                document.source_url,
                document.indications_original_text,
                document.source_document_storage_key,
                document.content_sha256,
            )
            immutable_incoming = (
                products_input_by_code[document_input.catalog_code].regulatory_type,
                document_input.effective_date,
                document_input.registration_number,
                document_input.source_name,
                document_input.source_url,
                document_input.indications_original_text,
                source_document_storage_key,
                document_input.content_sha256,
            )
            if immutable_existing != immutable_incoming:
                raise ValueError(
                    "document version content cannot be overwritten: "
                    f"{document_input.catalog_code}/{document_input.document_version}"
                )
            document.is_current = document_input.is_current
            document.archived_at = None if document_input.is_current else archived_at
    db.commit()
    db.refresh(batch)
    return batch


def _find_unreferenced_asset_keys(db: Session, keys: Iterable[str]) -> tuple[str, ...]:
    unique_keys = tuple(sorted(set(keys)))
    if not unique_keys:
        return ()
    referenced_image_keys = set(
        db.scalars(
            select(ProductImageAsset.storage_key).where(
                ProductImageAsset.storage_key.in_(unique_keys)
            )
        ).all()
    )
    referenced_document_keys = set(
        db.scalars(
            select(StandardProductDocument.source_document_storage_key).where(
                StandardProductDocument.source_document_storage_key.in_(unique_keys)
            )
        ).all()
    )
    referenced_keys = referenced_image_keys | referenced_document_keys
    return tuple(key for key in unique_keys if key not in referenced_keys)


def register_cleanup_keys(db: Session, keys: Iterable[str]) -> tuple[str, ...]:
    cleanup_keys = _find_unreferenced_asset_keys(db, keys)
    if not cleanup_keys:
        db.rollback()
        return ()
    existing_keys = set(
        db.scalars(
            select(ProductAssetCleanup.storage_key).where(
                ProductAssetCleanup.storage_key.in_(cleanup_keys)
            )
        ).all()
    )
    for key in cleanup_keys:
        if key in existing_keys:
            continue
        db.add(
            ProductAssetCleanup(
                storage_key=key,
                asset_type="image" if key.startswith("product-images/") else "document",
                reason="catalog_import_failed",
                import_batch_id=None,
            )
        )
    try:
        db.commit()
    except Exception as exc:
        db.rollback()
        raise CatalogCleanupRegistrationError(cleanup_keys) from exc
    return cleanup_keys


def apply_catalog_package(
    db: Session,
    storage: StorageBackend,
    package: ValidatedCatalogPackage,
) -> ImportReport:
    existing = _find_import_batch(
        db,
        package.manifest.catalog_version,
        package.manifest_sha256,
    )
    if existing is not None:
        report = _report_for_batch(existing, package)
        db.rollback()
        return report
    db.rollback()
    staged = stage_catalog_assets(storage, package)
    try:
        batch = _persist_catalog_transaction(db, package, staged)
    except IntegrityError:
        db.rollback()
        winner = _find_import_batch(
            db,
            package.manifest.catalog_version,
            package.manifest_sha256,
        )
        if winner is not None:
            report = _report_for_batch(winner, package)
            db.rollback()
            return report
        db.rollback()
        register_cleanup_keys(db, (asset.key for asset in staged))
        raise
    except Exception:
        db.rollback()
        register_cleanup_keys(db, (asset.key for asset in staged))
        raise
    return _report_for_batch(batch, package)


def import_catalog(
    db: Session | None,
    storage: StorageBackend | None,
    package: ValidatedCatalogPackage,
    *,
    dry_run: bool,
) -> ImportReport:
    if dry_run:
        return ImportReport(
            valid=True,
            catalog_version=package.manifest.catalog_version,
            products=len(package.products),
            aliases=len(package.aliases),
            documents=len(package.documents),
            images=len(package.images),
            errors=[],
        )
    if db is None or storage is None:
        raise RuntimeError("catalog persistence dependencies are required")
    return apply_catalog_package(db, storage, package)
