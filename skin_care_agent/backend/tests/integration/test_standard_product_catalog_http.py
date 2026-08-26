from __future__ import annotations

import csv
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
import hashlib
import json
import shutil
from pathlib import Path
from collections.abc import Iterator
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, sessionmaker

from app.config import get_settings
from app.db.session import get_db
from app.main import app
from app.models.product import PersonalProduct
from app.models.product_catalog import (
    CatalogImportBatch,
    ProductAssetCleanup,
    ProductImageAsset,
    StandardProduct,
    StandardProductAlias,
    StandardProductDocument,
)
from app.models.user import User
from app.services import catalog_import_service, product_search_service, product_service
from app.services.catalog_import_service import (
    CatalogCleanupRegistrationError,
    apply_catalog_package,
    stage_catalog_assets,
    validate_catalog_package,
)
from app.services.storage_service.base import SignedURL
from scripts.import_standard_products import run_import


BACKEND_ROOT = Path(__file__).resolve().parents[2]
CATALOG_FIXTURES = BACKEND_ROOT / "tests" / "fixtures" / "product_catalog"


class _TrackingStorage:
    def __init__(self) -> None:
        self.objects: dict[str, bytes] = {}
        self.put_count = 0
        self.signed_url_count = 0

    def put(self, key: str, data: bytes, content_type: str) -> None:
        self.put_count += 1
        self.objects[key] = data

    def get(self, key: str) -> bytes:
        return self.objects[key]

    def exists(self, key: str) -> bool:
        return key in self.objects

    def delete(self, key: str) -> None:
        self.objects.pop(key, None)

    def signed_url(self, key: str, ttl_seconds: int | None = None) -> SignedURL:
        self.signed_url_count += 1
        return SignedURL(
            url=f"https://storage.invalid/{key}?signature={self.signed_url_count}",
            expires_at=datetime(2026, 8, 25, tzinfo=timezone.utc)
            + timedelta(seconds=self.signed_url_count),
        )


@contextmanager
def _catalog_http_client(
    postgres_session_factory: sessionmaker[Session],
) -> Iterator[TestClient]:
    def override_get_db() -> Iterator[Session]:
        db = postgres_session_factory()
        try:
            yield db
        finally:
            db.close()

    previous = app.dependency_overrides.get(get_db)
    app.dependency_overrides[get_db] = override_get_db
    try:
        with TestClient(app) as client:
            yield client
    finally:
        if previous is None:
            app.dependency_overrides.pop(get_db, None)
        else:
            app.dependency_overrides[get_db] = previous


def _register_search_user(client: TestClient, label: str) -> tuple[dict[str, str], int]:
    suffix = uuid4().hex
    response = client.post(
        "/api/v1/auth/register",
        json={
            "email": f"catalog-search-{label}-{suffix}@example.test",
            "password": "Catalog-search-pass-2026",
            "nickname": label,
            "device_id": f"device-{suffix}",
        },
    )
    assert response.status_code == 201
    body = response.json()
    headers = {"Authorization": f"Bearer {body['tokens']['access_token']}"}
    settings = get_settings()
    consent = client.put(
        "/api/v1/me/consents",
        headers=headers,
        json={
            "consents": [
                {"consent_type": key, "version": version, "accepted": True}
                for key, version in settings.required_consents.items()
            ],
            "app_version": "catalog-search-test",
        },
    )
    assert consent.status_code == 200
    return headers, body["user"]["user_id"]


def test_dev_form_generates_request_id_for_slice_4a_search(
    postgres_session_factory: sessionmaker[Session],
    monkeypatch,
) -> None:
    from app.services import dev_catalog_service

    storage = _TrackingStorage()
    monkeypatch.setattr(dev_catalog_service, "get_storage", lambda: storage)
    monkeypatch.setattr(product_search_service, "get_storage", lambda: storage)
    with _catalog_http_client(postgres_session_factory) as client:
        headers, _ = _register_search_user(client, "dev-form")
        response = client.post(
            "/api/v1/dev/catalog/products",
            data={
                "brand_name": "体验品牌",
                "official_name": "体验洁面乳",
                "product_category": "洁面",
                "formula_version": "2026-08",
                "market_region": "CN",
                "concentration": "2% 水杨酸",
                "instructions": "洁面后取适量涂抹于面部，避开眼周。",
                "search_keywords": "体验泡沫洁面, 温和洁面",
            },
            files={
                "file": (
                    "cleanser.png",
                    (CATALOG_FIXTURES / "v1" / "assets" / "cleanser.png").read_bytes(),
                    "image/png",
                )
            },
        )

        assert response.status_code == 201
        payload = response.json()
        assert payload["brand_name"] == "体验品牌"
        assert payload["official_name"] == "体验洁面乳"
        assert payload["regulatory_type"] == "cosmetic"
        assert payload["key_strength"] == "2% 水杨酸"
        assert payload["current_document"]["indications_original_text"] == (
            "洁面后取适量涂抹于面部，避开眼周。"
        )
        assert payload["catalog_code"].startswith("dev-form-")
        assert payload["image_url"].startswith("https://storage.invalid/product-images/catalog/")
        assert storage.put_count == 1

        search = client.get(
            "/api/v1/product-search",
            headers=headers,
            params={"q": "体验洁面乳"},
        )
        assert search.status_code == 200
        assert search.json()["items"][0]["standard_product_id"] == payload[
            "standard_product_id"
        ]

        keyword_search = client.get(
            "/api/v1/product-search",
            headers=headers,
            params={"q": "体验泡沫洁面"},
        )
        assert keyword_search.status_code == 200
        assert keyword_search.json()["items"][0]["standard_product_id"] == payload[
            "standard_product_id"
        ]


def _rewrite_catalog_codes(path: Path, namespace: str) -> tuple[str, ...]:
    products_path = path / "products.csv"
    with products_path.open(encoding="utf-8", newline="") as source:
        reader = csv.DictReader(source)
        product_fields = list(reader.fieldnames or [])
        products = list(reader)
    code_map = {
        row["catalog_code"]: f"{namespace}-{row['catalog_code']}"
        for row in products
    }
    for row in products:
        row["catalog_code"] = code_map[row["catalog_code"]]
    with products_path.open("w", encoding="utf-8", newline="") as output:
        writer = csv.DictWriter(output, fieldnames=product_fields)
        writer.writeheader()
        writer.writerows(products)

    for filename in ("aliases.csv", "documents.csv"):
        csv_path = path / filename
        with csv_path.open(encoding="utf-8", newline="") as source:
            reader = csv.DictReader(source)
            fields = list(reader.fieldnames or [])
            rows = list(reader)
        for row in rows:
            row["catalog_code"] = code_map[row["catalog_code"]]
        with csv_path.open("w", encoding="utf-8", newline="") as output:
            writer = csv.DictWriter(output, fieldnames=fields)
            writer.writeheader()
            writer.writerows(rows)
    return tuple(code_map.values())


def _copy_package(tmp_path: Path, version: str, namespace: str) -> tuple[Path, tuple[str, ...]]:
    destination = tmp_path / f"{version}-{namespace}"
    shutil.copytree(CATALOG_FIXTURES / version, destination)
    manifest_path = destination / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest["catalog_version"] = f"synthetic-{version}-{namespace}"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False), encoding="utf-8")
    return destination, _rewrite_catalog_codes(destination, namespace)


def _reuse_v1_cleanser_image(v1_source: Path, v2_source: Path) -> None:
    reused_image = (v1_source / "assets" / "cleanser.png").read_bytes()
    (v2_source / "assets" / "cleanser.png").write_bytes(reused_image)
    products_path = v2_source / "products.csv"
    with products_path.open(encoding="utf-8", newline="") as source:
        reader = csv.DictReader(source)
        fields = list(reader.fieldnames or [])
        rows = list(reader)
    rows[0]["primary_image_sha256"] = hashlib.sha256(reused_image).hexdigest()
    with products_path.open("w", encoding="utf-8", newline="") as output:
        writer = csv.DictWriter(output, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)


def _reuse_v1_document_versions(v2_source: Path) -> None:
    documents_path = v2_source / "documents.csv"
    with documents_path.open(encoding="utf-8", newline="") as source:
        reader = csv.DictReader(source)
        fields = list(reader.fieldnames or [])
        rows = list(reader)
    for row in rows:
        row["document_version"] = "2026-01"
    with documents_path.open("w", encoding="utf-8", newline="") as output:
        writer = csv.DictWriter(output, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)


def _catalog_counts(db: Session, *, versions: tuple[str, ...], codes: tuple[str, ...]) -> dict[str, int]:
    return {
        "batches": db.scalar(
            select(func.count()).select_from(CatalogImportBatch).where(
                CatalogImportBatch.catalog_version.in_(versions)
            )
        )
        or 0,
        "products": db.scalar(
            select(func.count()).select_from(StandardProduct).where(
                StandardProduct.catalog_code.in_(codes)
            )
        )
        or 0,
        "aliases": db.scalar(
            select(func.count())
            .select_from(StandardProductAlias)
            .join(StandardProduct)
            .where(StandardProduct.catalog_code.in_(codes))
        )
        or 0,
        "documents": db.scalar(
            select(func.count())
            .select_from(StandardProductDocument)
            .join(StandardProduct)
            .where(StandardProduct.catalog_code.in_(codes))
        )
        or 0,
    }


def test_same_catalog_import_is_idempotent(
    postgres_session_factory: sessionmaker[Session],
    tmp_path: Path,
) -> None:
    namespace = uuid4().hex[:10]
    source, codes = _copy_package(tmp_path, "v1", namespace)
    package = validate_catalog_package(source)
    storage = _TrackingStorage()
    db = postgres_session_factory()
    try:
        first = apply_catalog_package(db, storage, package)
        counts_after_first = _catalog_counts(
            db,
            versions=(package.manifest.catalog_version,),
            codes=codes,
        )
        puts_after_first = storage.put_count

        second = apply_catalog_package(db, storage, package)

        assert second.batch_id == first.batch_id
        assert second.persisted_counts == first.persisted_counts
        assert _catalog_counts(
            db,
            versions=(package.manifest.catalog_version,),
            codes=codes,
        ) == counts_after_first == {
            "batches": 1,
            "products": 3,
            "aliases": 4,
            "documents": 2,
        }
        assert storage.put_count == puts_after_first == 3
    finally:
        db.close()


def test_v2_import_switches_current_assets_and_preserves_v1_history(
    postgres_session_factory: sessionmaker[Session],
    tmp_path: Path,
) -> None:
    namespace = uuid4().hex[:10]
    v1_source, codes = _copy_package(tmp_path, "v1", namespace)
    v2_source, repeated_codes = _copy_package(tmp_path, "v2", namespace)
    assert repeated_codes == codes
    v1 = validate_catalog_package(v1_source)
    v2 = validate_catalog_package(v2_source)
    storage = _TrackingStorage()
    db = postgres_session_factory()
    try:
        first = apply_catalog_package(db, storage, v1)
        cleanser_code, drug_code, _ = codes
        cleanser_v1 = db.scalar(
            select(StandardProduct).where(StandardProduct.catalog_code == cleanser_code)
        )
        assert cleanser_v1 is not None
        stable_product_id = cleanser_v1.id
        old_image_id = cleanser_v1.primary_image_asset_id
        old_image_asset = db.get(ProductImageAsset, old_image_id)
        assert old_image_asset is not None
        old_image_storage_key = old_image_asset.storage_key

        second = apply_catalog_package(db, storage, v2)

        cleanser_v2 = db.scalar(
            select(StandardProduct).where(StandardProduct.catalog_code == cleanser_code)
        )
        assert cleanser_v2 is not None
        assert second.batch_id != first.batch_id
        assert cleanser_v2.id == stable_product_id
        assert cleanser_v2.official_name == "合成洁面资料更新"
        assert cleanser_v2.primary_image_asset_id != old_image_id
        assert db.get(ProductImageAsset, old_image_id) is not None
        assert storage.exists(old_image_storage_key)
        new_image_asset = db.get(ProductImageAsset, cleanser_v2.primary_image_asset_id)
        assert new_image_asset is not None
        assert storage.exists(new_image_asset.storage_key)

        drug = db.scalar(select(StandardProduct).where(StandardProduct.catalog_code == drug_code))
        assert drug is not None
        assert drug.status == "inactive"
        documents = db.scalars(
            select(StandardProductDocument)
            .where(StandardProductDocument.standard_product_id == drug.id)
            .order_by(StandardProductDocument.document_version)
        ).all()
        assert [(document.document_version, document.is_current) for document in documents] == [
            ("2026-01", False),
            ("2026-02", True),
        ]
        assert documents[0].content_sha256 == "f12988392fc4d7add66bac725419b7aba791db4879c676b3f1a172dd31623b2a"
        assert documents[1].source_document_storage_key is not None
        assert storage.exists(documents[1].source_document_storage_key)
    finally:
        db.close()


def test_failed_import_registers_only_unreferenced_staged_assets(
    postgres_session_factory: sessionmaker[Session],
    tmp_path: Path,
    monkeypatch,
) -> None:
    namespace = uuid4().hex[:10]
    v1_source, codes = _copy_package(tmp_path, "v1", namespace)
    v2_source, _ = _copy_package(tmp_path, "v2", namespace)
    _reuse_v1_cleanser_image(v1_source, v2_source)
    v1 = validate_catalog_package(v1_source)
    v2 = validate_catalog_package(v2_source)
    storage = _TrackingStorage()
    db = postgres_session_factory()
    try:
        first = apply_catalog_package(db, storage, v1)
        staged_v2 = stage_catalog_assets(storage, v2)
        referenced_keys = set(
            db.scalars(
                select(ProductImageAsset.storage_key)
                .join(StandardProduct)
                .where(StandardProduct.catalog_code.in_(codes))
            ).all()
        )

        def force_database_failure(*args, **kwargs):
            raise RuntimeError("forced catalog transaction failure")

        monkeypatch.setattr(
            catalog_import_service,
            "_persist_catalog_transaction",
            force_database_failure,
        )
        try:
            apply_catalog_package(db, storage, v2)
        except RuntimeError as exc:
            assert str(exc) == "forced catalog transaction failure"
        else:
            raise AssertionError("forced catalog transaction failure was not raised")

        expected_cleanup = {
            asset.key: asset.asset_type
            for asset in staged_v2
            if asset.key not in referenced_keys
        }
        cleanup_rows = db.scalars(select(ProductAssetCleanup)).all()
        assert {row.storage_key: row.asset_type for row in cleanup_rows} == expected_cleanup
        assert referenced_keys.isdisjoint(row.storage_key for row in cleanup_rows)
        assert db.scalar(
            select(func.count()).select_from(CatalogImportBatch).where(
                CatalogImportBatch.catalog_version == v2.manifest.catalog_version
            )
        ) == 0
        current = db.scalar(
            select(StandardProduct).where(StandardProduct.catalog_code == codes[0])
        )
        assert current is not None
        assert current.import_batch_id == first.batch_id
        assert current.official_name == "合成洁面"
    finally:
        db.close()


def test_import_cleanup_registration_failure_reports_exact_unreferenced_keys(
    postgres_session_factory: sessionmaker[Session],
    tmp_path: Path,
    monkeypatch,
) -> None:
    namespace = uuid4().hex[:10]
    v1_source, codes = _copy_package(tmp_path, "v1", namespace)
    v2_source, _ = _copy_package(tmp_path, "v2", namespace)
    _reuse_v1_cleanser_image(v1_source, v2_source)
    v1 = validate_catalog_package(v1_source)
    v2 = validate_catalog_package(v2_source)
    storage = _TrackingStorage()
    db = postgres_session_factory()
    try:
        apply_catalog_package(db, storage, v1)
        staged_v2 = stage_catalog_assets(storage, v2)
        referenced_keys = set(
            db.scalars(
                select(ProductImageAsset.storage_key)
                .join(StandardProduct)
                .where(StandardProduct.catalog_code.in_(codes))
            ).all()
        )
        expected_cleanup_keys = tuple(
            sorted(asset.key for asset in staged_v2 if asset.key not in referenced_keys)
        )

        def force_database_failure(*args, **kwargs):
            raise RuntimeError("forced catalog transaction failure")

        def force_cleanup_commit_failure() -> None:
            raise RuntimeError("forced cleanup commit failure")

        monkeypatch.setattr(
            catalog_import_service,
            "_persist_catalog_transaction",
            force_database_failure,
        )
        monkeypatch.setattr(db, "commit", force_cleanup_commit_failure)

        with pytest.raises(CatalogCleanupRegistrationError) as error:
            apply_catalog_package(db, storage, v2)

        assert error.value.cleanup_keys == expected_cleanup_keys
        assert all(code not in str(error.value) for code in codes)
    finally:
        db.close()


def test_formal_import_cli_runner_uses_database_and_storage_dependencies(
    postgres_session_factory: sessionmaker[Session],
    tmp_path: Path,
) -> None:
    namespace = uuid4().hex[:10]
    source, codes = _copy_package(tmp_path, "v1", namespace)
    storage = _TrackingStorage()

    first = run_import(
        source=source,
        dry_run=False,
        session_factory=postgres_session_factory,
        storage=storage,
    )
    second = run_import(
        source=source,
        dry_run=False,
        session_factory=postgres_session_factory,
        storage=storage,
    )

    assert first.valid is True
    assert second.batch_id == first.batch_id
    with postgres_session_factory() as db:
        assert _catalog_counts(
            db,
            versions=(first.catalog_version,),
            codes=codes,
        ) == {
            "batches": 1,
            "products": 3,
            "aliases": 4,
            "documents": 2,
        }


def test_import_rejects_overwriting_an_existing_document_version(
    postgres_session_factory: sessionmaker[Session],
    tmp_path: Path,
) -> None:
    namespace = uuid4().hex[:10]
    v1_source, codes = _copy_package(tmp_path, "v1", namespace)
    v2_source, _ = _copy_package(tmp_path, "v2", namespace)
    _reuse_v1_document_versions(v2_source)
    v1 = validate_catalog_package(v1_source)
    conflicting_v2 = validate_catalog_package(v2_source)
    storage = _TrackingStorage()
    db = postgres_session_factory()
    try:
        first = apply_catalog_package(db, storage, v1)

        with pytest.raises(ValueError, match="document version content cannot be overwritten"):
            apply_catalog_package(db, storage, conflicting_v2)

        current = db.scalar(
            select(StandardProduct).where(StandardProduct.catalog_code == codes[0])
        )
        assert current is not None
        assert current.import_batch_id == first.batch_id
        assert current.official_name == "合成洁面"
        documents = db.scalars(
            select(StandardProductDocument)
            .join(StandardProduct)
            .where(StandardProduct.catalog_code.in_(codes))
        ).all()
        assert len(documents) == 2
        assert all(document.document_version == "2026-01" for document in documents)
        assert all(document.is_current for document in documents)
        assert db.scalar(
            select(func.count()).select_from(CatalogImportBatch).where(
                CatalogImportBatch.catalog_version == conflicting_v2.manifest.catalog_version
            )
        ) == 0
    finally:
        db.close()


def test_import_integrity_race_returns_the_committed_winner(
    postgres_session_factory: sessionmaker[Session],
    tmp_path: Path,
    monkeypatch,
) -> None:
    namespace = uuid4().hex[:10]
    source, codes = _copy_package(tmp_path, "v1", namespace)
    package = validate_catalog_package(source)
    storage = _TrackingStorage()
    db = postgres_session_factory()
    original_persist = catalog_import_service._persist_catalog_transaction

    def persist_winner_then_raise_integrity(db, package, staged):
        original_persist(db, package, staged)
        raise IntegrityError("concurrent catalog batch", {}, RuntimeError("synthetic race"))

    monkeypatch.setattr(
        catalog_import_service,
        "_persist_catalog_transaction",
        persist_winner_then_raise_integrity,
    )
    try:
        report = apply_catalog_package(db, storage, package)

        assert report.valid is True
        assert report.batch_id is not None
        assert _catalog_counts(
            db,
            versions=(package.manifest.catalog_version,),
            codes=codes,
        ) == {
            "batches": 1,
            "products": 3,
            "aliases": 4,
            "documents": 2,
        }
        assert db.scalar(select(func.count()).select_from(ProductAssetCleanup)) == 0
    finally:
        db.close()


def test_search_http_orders_normalized_tiers_and_paginates_without_account_leaks(
    postgres_session_factory: sessionmaker[Session],
    tmp_path: Path,
    monkeypatch,
) -> None:
    namespace = uuid4().hex[:10]
    source, codes = _copy_package(tmp_path, "v1", namespace)
    package = validate_catalog_package(source)
    storage = _TrackingStorage()
    with postgres_session_factory() as db:
        apply_catalog_package(db, storage, package)

    monkeypatch.setattr(product_search_service, "get_storage", lambda: storage)
    with _catalog_http_client(postgres_session_factory) as client:
        owner_headers, owner_id = _register_search_user(client, "owner")
        other_headers, other_id = _register_search_user(client, "other")
        with postgres_session_factory() as db:
            cleanser = db.scalar(
                select(StandardProduct).where(StandardProduct.catalog_code == codes[0])
            )
            device = db.scalar(
                select(StandardProduct).where(StandardProduct.catalog_code == codes[2])
            )
            assert cleanser is not None and device is not None
            db.add(
                StandardProductAlias(
                    standard_product_id=device.id,
                    alias="合成洁面",
                    normalized_alias="合成洁面",
                    language="zh-CN",
                    import_batch_id=device.import_batch_id,
                )
            )
            owner_exact = PersonalProduct(
                user_id=owner_id,
                client_request_id=uuid4(),
                name="合成洁面",
                normalized_name="合成洁面",
            )
            linked = PersonalProduct(
                user_id=owner_id,
                client_request_id=uuid4(),
                name="我的标准洁面",
                normalized_name="我的标准洁面",
                standard_product_id=cleanser.id,
            )
            owner_asset = ProductImageAsset(
                storage_key=f"product-images/users/{owner_id}/search.png",
                mime_type="image/png",
                byte_size=12,
                width=2,
                height=2,
                sha256="a" * 64,
                source_type="user",
                owner_user_id=owner_id,
            )
            db.add_all([owner_exact, linked, owner_asset])
            db.flush()
            owner_image = PersonalProduct(
                user_id=owner_id,
                client_request_id=uuid4(),
                name="独享自建产品",
                normalized_name="独享自建产品",
                user_image_asset_id=owner_asset.id,
            )
            other_exact = PersonalProduct(
                user_id=other_id,
                client_request_id=uuid4(),
                name="合成洁面",
                normalized_name="合成洁面",
            )
            db.add_all([owner_image, other_exact])
            db.commit()
            owner_exact_id = owner_exact.id
            owner_image_id = owner_image.id
            other_exact_id = other_exact.id
            cleanser_id = cleanser.id

        ranked = client.get(
            "/api/v1/product-search",
            params={"q": "  合成，洁面！  "},
            headers=owner_headers,
        )
        assert ranked.status_code == 200
        ranked_items = ranked.json()["items"]
        assert [item["match_type"] for item in ranked_items[:3]] == [
            "personal_exact",
            "standard_exact",
            "standard_alias",
        ]
        assert ranked_items[0]["personal_product_id"] == owner_exact_id
        assert ranked_items[1]["standard_product_id"] == cleanser_id
        assert ranked_items[1]["in_cabinet"] is True
        assert ranked_items[1]["personal_product_id"] == linked.id
        assert all("indications" not in item for item in ranked_items)

        for query, expected_match in [
            ("Ｓｙｎｔｈｅｔｉｃ　Ｃｌｅａｎｓｅｒ", "standard_alias"),
            ("hecheng jiemian", "standard_alias"),
            ("合成药品凝", "prefix"),
            ("药品凝", "contains"),
            ("hecheng jieman", "fuzzy"),
        ]:
            response = client.get(
                "/api/v1/product-search",
                params={"q": query},
                headers=owner_headers,
            )
            assert response.status_code == 200
            assert response.json()["items"][0]["match_type"] == expected_match

        full = client.get(
            "/api/v1/product-search",
            params={"q": "合成", "limit": 50},
            headers=owner_headers,
        ).json()
        collected: list[tuple[str, int | None, int | None]] = []
        cursor = None
        while True:
            params: dict[str, str | int] = {"q": "合成", "limit": 2}
            if cursor is not None:
                params["cursor"] = cursor
            page = client.get(
                "/api/v1/product-search",
                params=params,
                headers=owner_headers,
            )
            assert page.status_code == 200
            page_body = page.json()
            collected.extend(
                (
                    item["source_type"],
                    item["personal_product_id"],
                    item["standard_product_id"],
                )
                for item in page_body["items"]
            )
            cursor = page_body["next_cursor"]
            if cursor is None:
                break
        assert collected == [
            (item["source_type"], item["personal_product_id"], item["standard_product_id"])
            for item in full["items"]
        ]
        assert len(collected) == len(set(collected))

        first_signed = client.get(
            "/api/v1/product-search",
            params={"q": "独享自建产品"},
            headers=owner_headers,
        ).json()["items"][0]
        second_signed = client.get(
            "/api/v1/product-search",
            params={"q": "独享自建产品"},
            headers=owner_headers,
        ).json()["items"][0]
        assert first_signed["personal_product_id"] == owner_image_id
        assert first_signed["image_url"] != second_signed["image_url"]

        other_ranked = client.get(
            "/api/v1/product-search",
            params={"q": "合成洁面"},
            headers=other_headers,
        ).json()["items"]
        assert other_ranked[0]["personal_product_id"] == other_exact_id
        other_standard = next(
            item for item in other_ranked if item["standard_product_id"] == cleanser_id
        )
        assert other_standard["in_cabinet"] is False
        assert other_standard["personal_product_id"] is None
        assert all(item["personal_product_id"] != owner_exact_id for item in other_ranked)
        assert (
            client.get(
                "/api/v1/product-search",
                params={"q": "独享自建产品"},
                headers=other_headers,
            ).json()["items"]
            == []
        )

        invalid_cursor = client.get(
            "/api/v1/product-search",
            params={"q": "合成", "cursor": "not-a-cursor"},
            headers=owner_headers,
        )
        assert invalid_cursor.status_code == 400


def test_search_excludes_inactive_but_detail_keeps_current_original_document(
    postgres_session_factory: sessionmaker[Session],
    tmp_path: Path,
    monkeypatch,
) -> None:
    namespace = uuid4().hex[:10]
    v1_source, codes = _copy_package(tmp_path, "v1", namespace)
    v2_source, repeated_codes = _copy_package(tmp_path, "v2", namespace)
    assert repeated_codes == codes
    storage = _TrackingStorage()
    with postgres_session_factory() as db:
        apply_catalog_package(db, storage, validate_catalog_package(v1_source))
        apply_catalog_package(db, storage, validate_catalog_package(v2_source))
        inactive = db.scalar(
            select(StandardProduct).where(StandardProduct.catalog_code == codes[1])
        )
        assert inactive is not None and inactive.status == "inactive"
        inactive_id = inactive.id

    monkeypatch.setattr(product_search_service, "get_storage", lambda: storage)
    with _catalog_http_client(postgres_session_factory) as client:
        headers, _ = _register_search_user(client, "inactive-detail")
        search = client.get(
            "/api/v1/product-search",
            params={"q": "合成药品凝胶"},
            headers=headers,
        )
        assert search.status_code == 200
        assert all(
            item["standard_product_id"] != inactive_id for item in search.json()["items"]
        )

        detail = client.get(f"/api/v1/catalog/products/{inactive_id}", headers=headers)
        assert detail.status_code == 200
        payload = detail.json()
        assert payload["status"] == "inactive"
        assert payload["current_document"]["document_version"] == "2026-02"
        assert payload["current_document"]["indications_original_text"].startswith("仅用于")
        assert payload["current_document"]["source_name"] == "合成监管来源"
        assert payload["current_document"]["original_document_url"].startswith(
            "https://storage.invalid/product-documents/catalog/"
        )
        assert "summary" not in payload["current_document"]
        assert "recommendation" not in payload

        refreshed = client.get(f"/api/v1/catalog/products/{inactive_id}", headers=headers)
        assert refreshed.status_code == 200
        assert refreshed.json()["image_url"] != payload["image_url"]
        assert (
            refreshed.json()["current_document"]["original_document_url"]
            != payload["current_document"]["original_document_url"]
        )


def test_cabinet_http_add_is_double_idempotent_current_and_account_isolated(
    postgres_session_factory: sessionmaker[Session],
    tmp_path: Path,
    monkeypatch,
) -> None:
    namespace = uuid4().hex[:10]
    v1_source, codes = _copy_package(tmp_path, "v1", namespace)
    v2_source, repeated_codes = _copy_package(tmp_path, "v2", namespace)
    assert repeated_codes == codes
    storage = _TrackingStorage()
    with postgres_session_factory() as db:
        apply_catalog_package(db, storage, validate_catalog_package(v1_source))
        standards = {
            item.catalog_code: item
            for item in db.scalars(
                select(StandardProduct).where(StandardProduct.catalog_code.in_(codes))
            ).all()
        }
        cleanser_id = standards[codes[0]].id
        drug_id = standards[codes[1]].id
        device_id = standards[codes[2]].id
    puts_after_import = storage.put_count

    monkeypatch.setattr(product_service, "get_storage", lambda: storage)
    with _catalog_http_client(postgres_session_factory) as client:
        owner_headers, owner_id = _register_search_user(client, "cabinet-owner")
        other_headers, _ = _register_search_user(client, "cabinet-other")
        request_id = str(uuid4())
        first = client.post(
            "/api/v1/products/from-standard",
            headers=owner_headers,
            json={
                "client_request_id": request_id,
                "standard_product_id": cleanser_id,
                "display_name_override": None,
            },
        )
        assert first.status_code == 201
        first_body = first.json()
        assert first_body["name"] == "合成洁面"
        assert first_body["source_type"] == "standard"
        assert first_body["standard_product_id"] == cleanser_id
        assert first_body["brand_name"] == "合成品牌"
        assert first_body["formula_version"] == "v1"
        assert first_body["regulatory_type"] == "cosmetic"
        assert "/product-images/catalog/" in first_body["image_url"]
        assert storage.put_count == puts_after_import

        request_retry = client.post(
            "/api/v1/products/from-standard",
            headers=owner_headers,
            json={
                "client_request_id": request_id,
                "standard_product_id": device_id,
                "display_name_override": "不得覆盖",
            },
        )
        second_request = client.post(
            "/api/v1/products/from-standard",
            headers=owner_headers,
            json={
                "client_request_id": str(uuid4()),
                "standard_product_id": cleanser_id,
                "display_name_override": "也不得覆盖",
            },
        )
        assert request_retry.status_code == 200
        assert second_request.status_code == 200
        assert {
            first_body["product_id"],
            request_retry.json()["product_id"],
            second_request.json()["product_id"],
        } == {first_body["product_id"]}
        assert request_retry.json()["name"] == "合成洁面"
        assert second_request.json()["name"] == "合成洁面"

        override = client.post(
            "/api/v1/products/from-standard",
            headers=owner_headers,
            json={
                "client_request_id": str(uuid4()),
                "standard_product_id": device_id,
                "display_name_override": "  我的合成贴  ",
            },
        )
        assert override.status_code == 201
        assert override.json()["name"] == "我的合成贴"

        assert client.post(
            "/api/v1/products/from-standard",
            headers=owner_headers,
            json={
                "client_request_id": str(uuid4()),
                "standard_product_id": 999999999,
                "display_name_override": None,
            },
        ).status_code == 404
        assert client.post(
            "/api/v1/products/from-standard",
            headers=owner_headers,
            json={
                "client_request_id": str(uuid4()),
                "standard_product_id": drug_id,
                "display_name_override": "   ",
            },
        ).status_code == 422
        assert client.post(
            "/api/v1/products/from-standard",
            headers=owner_headers,
            json={
                "client_request_id": str(uuid4()),
                "standard_product_id": drug_id,
                "display_name_override": "长" * 121,
            },
        ).status_code == 422

        with postgres_session_factory() as db:
            apply_catalog_package(db, storage, validate_catalog_package(v2_source))
        inactive = client.post(
            "/api/v1/products/from-standard",
            headers=owner_headers,
            json={
                "client_request_id": str(uuid4()),
                "standard_product_id": drug_id,
                "display_name_override": None,
            },
        )
        assert inactive.status_code == 409
        assert inactive.json()["detail"] == "standard product is inactive"

        listed = client.get("/api/v1/products", headers=owner_headers)
        assert listed.status_code == 200
        by_standard = {item["standard_product_id"]: item for item in listed.json()}
        assert set(by_standard) == {cleanser_id, device_id}
        assert by_standard[cleanser_id]["name"] == "合成洁面资料更新"
        assert by_standard[cleanser_id]["image_url"] != first_body["image_url"]
        assert by_standard[device_id]["name"] == "我的合成贴"

        other = client.post(
            "/api/v1/products/from-standard",
            headers=other_headers,
            json={
                "client_request_id": str(uuid4()),
                "standard_product_id": cleanser_id,
                "display_name_override": None,
            },
        )
        assert other.status_code == 201
        assert other.json()["product_id"] != first_body["product_id"]
        assert len(client.get("/api/v1/products", headers=other_headers).json()) == 1

        with postgres_session_factory() as db:
            owner_rows = db.scalars(
                select(PersonalProduct).where(PersonalProduct.user_id == owner_id)
            ).all()
            assert len(owner_rows) == 2
            cleanser_row = next(
                row for row in owner_rows if row.standard_product_id == cleanser_id
            )
            assert cleanser_row.name == "合成洁面"
            assert cleanser_row.display_name_override is None
            assert cleanser_row.user_image_asset_id is None


def test_cabinet_integrity_race_returns_the_postgresql_winner(
    postgres_session_factory: sessionmaker[Session],
    tmp_path: Path,
    monkeypatch,
) -> None:
    namespace = uuid4().hex[:10]
    source, codes = _copy_package(tmp_path, "v1", namespace)
    storage = _TrackingStorage()
    with postgres_session_factory() as db:
        apply_catalog_package(db, storage, validate_catalog_package(source))
        standard = db.scalar(
            select(StandardProduct).where(StandardProduct.catalog_code == codes[0])
        )
        assert standard is not None
        standard_id = standard.id

    with postgres_session_factory() as db:
        user = User(nickname="cabinet-race")
        db.add(user)
        db.commit()
        user_id = user.id
        original_commit = db.commit

        def commit_winner_then_raise_integrity() -> None:
            original_commit()
            raise IntegrityError("concurrent cabinet add", {}, RuntimeError("synthetic race"))

        monkeypatch.setattr(db, "commit", commit_winner_then_raise_integrity)
        product, created = product_service.add_standard_product_to_cabinet(
            db,
            user_id=user_id,
            client_request_id=uuid4(),
            standard_product_id=standard_id,
            display_name_override=None,
        )

        assert created is False
        assert product.standard_product_id == standard_id
        assert db.scalar(
            select(func.count()).select_from(PersonalProduct).where(
                PersonalProduct.user_id == user_id,
                PersonalProduct.standard_product_id == standard_id,
            )
        ) == 1


def test_cabinet_add_keeps_full_current_name_when_legacy_column_is_shorter(
    postgres_session_factory: sessionmaker[Session],
    tmp_path: Path,
) -> None:
    namespace = uuid4().hex[:10]
    source, codes = _copy_package(tmp_path, "v1", namespace)
    storage = _TrackingStorage()
    current_name = "长" * 180
    with postgres_session_factory() as db:
        apply_catalog_package(db, storage, validate_catalog_package(source))
        standard = db.scalar(
            select(StandardProduct).where(StandardProduct.catalog_code == codes[0])
        )
        assert standard is not None
        standard.official_name = current_name
        standard.normalized_official_name = current_name
        user = User(nickname="cabinet-long-name")
        db.add(user)
        db.commit()

        product, created = product_service.add_standard_product_to_cabinet(
            db,
            user_id=user.id,
            client_request_id=uuid4(),
            standard_product_id=standard.id,
            display_name_override=None,
        )

        assert created is True
        assert product.name == "长" * 120
        assert product_service._product_out(db, product).name == current_name


def test_product_use_keeps_linked_standard_v1_snapshot_after_catalog_v2(
    postgres_session_factory: sessionmaker[Session],
    tmp_path: Path,
    monkeypatch,
) -> None:
    namespace = uuid4().hex[:10]
    v1_source, codes = _copy_package(tmp_path, "v1", namespace)
    v2_source, repeated_codes = _copy_package(tmp_path, "v2", namespace)
    assert repeated_codes == codes
    storage = _TrackingStorage()
    with postgres_session_factory() as db:
        apply_catalog_package(db, storage, validate_catalog_package(v1_source))
        device = db.scalar(
            select(StandardProduct).where(StandardProduct.catalog_code == codes[2])
        )
        assert device is not None
        device_id = device.id

    monkeypatch.setattr(product_service, "get_storage", lambda: storage)
    with _catalog_http_client(postgres_session_factory) as client:
        headers, _ = _register_search_user(client, "snapshot-v1-v2")
        added = client.post(
            "/api/v1/products/from-standard",
            headers=headers,
            json={
                "client_request_id": str(uuid4()),
                "standard_product_id": device_id,
                "display_name_override": None,
            },
        )
        assert added.status_code == 201
        product_id = added.json()["product_id"]

        created = client.post(
            "/api/v1/product-uses",
            headers=headers,
            json={
                "client_request_id": str(uuid4()),
                "used_at": "2026-08-25T09:00:00+08:00",
                "used_timezone_offset_minutes": 480,
                "product_ids": [product_id],
                "note": None,
            },
        )
        assert created.status_code == 201
        use = created.json()
        v1_snapshot = use["products"][0]
        assert v1_snapshot["name"] == "合成器械贴"
        assert v1_snapshot["brand_name"] == "合成器械品牌"
        assert v1_snapshot["formula_version"] == "model-v1"
        assert v1_snapshot["image_asset_id"] is not None
        assert v1_snapshot["document_version"] == "2026-01"

        with postgres_session_factory() as db:
            apply_catalog_package(db, storage, validate_catalog_package(v2_source))

        current = client.get(f"/api/v1/products/{product_id}", headers=headers)
        assert current.status_code == 200
        assert current.json()["name"] == "合成器械贴"
        assert current.json()["image_url"] != added.json()["image_url"]

        restored = client.get(
            f"/api/v1/product-uses/{use['product_use_id']}", headers=headers
        )
        assert restored.status_code == 200
        restored_snapshot = restored.json()["products"][0]
        assert {
            key: restored_snapshot[key]
            for key in ("name", "brand_name", "formula_version", "image_asset_id", "document_id", "document_version")
        } == {
            key: v1_snapshot[key]
            for key in ("name", "brand_name", "formula_version", "image_asset_id", "document_id", "document_version")
        }
        assert restored_snapshot["image_url"] != current.json()["image_url"]
