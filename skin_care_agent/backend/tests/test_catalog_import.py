from __future__ import annotations

import csv
import hashlib
import json
import subprocess
import sys
from io import BytesIO
from pathlib import Path

import pytest
from PIL import Image

from app.services.catalog_import_service import (
    import_catalog,
    stage_catalog_assets,
    validate_catalog_package,
)


BACKEND_ROOT = Path(__file__).resolve().parents[1]
CATALOG_FIXTURE_ROOT = BACKEND_ROOT / "tests" / "fixtures" / "product_catalog"


class _WriteGuard:
    def __init__(self) -> None:
        self.writes: list[tuple[object, ...]] = []

    def add(self, *args: object) -> None:
        self.writes.append(args)

    def put(self, *args: object) -> None:
        self.writes.append(args)

    def commit(self) -> None:
        self.writes.append(("commit",))


class _MemoryStorage:
    def __init__(self) -> None:
        self.objects: dict[str, bytes] = {}
        self.puts: list[tuple[str, str]] = []

    def put(self, key: str, data: bytes, content_type: str) -> None:
        self.objects[key] = data
        self.puts.append((key, content_type))

    def get(self, key: str) -> bytes:
        return self.objects[key]

    def exists(self, key: str) -> bool:
        return key in self.objects


def _png_bytes() -> bytes:
    image = Image.new("RGB", (4, 6), color=(90, 120, 150))
    output = BytesIO()
    image.save(output, format="PNG")
    return output.getvalue()


def _write_csv(path: Path, fieldnames: list[str], rows: list[dict[str, str]]) -> None:
    with path.open("w", encoding="utf-8", newline="") as output:
        writer = csv.DictWriter(output, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def _read_csv(path: Path) -> tuple[list[str], list[dict[str, str]]]:
    with path.open(encoding="utf-8", newline="") as source:
        reader = csv.DictReader(source)
        return list(reader.fieldnames or []), list(reader)


def _write_valid_package(root: Path) -> Path:
    root.mkdir(parents=True)
    assets = root / "assets"
    assets.mkdir()
    image_bytes = _png_bytes()
    image_sha256 = hashlib.sha256(image_bytes).hexdigest()
    for name in ("cleanser.png", "gel.png", "device.png"):
        (assets / name).write_bytes(image_bytes)

    drug_document = "仅用于自动化测试的合成药品说明书原始文件。\n".encode()
    device_document = "仅用于自动化测试的合成器械资料原始文件。\n".encode()
    (assets / "drug-document.txt").write_bytes(drug_document)
    (assets / "device-document.txt").write_bytes(device_document)

    manifest = {
        "catalog_version": "synthetic-v1",
        "generated_at": "2026-08-24T00:00:00Z",
        "products_file": "products.csv",
        "aliases_file": "aliases.csv",
        "documents_file": "documents.csv",
    }
    (root / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False),
        encoding="utf-8",
    )

    _write_csv(
        root / "products.csv",
        [
            "catalog_code",
            "brand_name",
            "official_name",
            "product_category",
            "formula_version",
            "key_strength",
            "regulatory_type",
            "registration_number",
            "market_region",
            "status",
            "primary_image_path",
            "primary_image_mime_type",
            "primary_image_sha256",
        ],
        [
            {
                "catalog_code": "synthetic-cleanser-v1",
                "brand_name": "合成品牌",
                "official_name": "合成洁面",
                "product_category": "cleanser",
                "formula_version": "v1",
                "key_strength": "",
                "regulatory_type": "cosmetic",
                "registration_number": "",
                "market_region": "CN",
                "status": "active",
                "primary_image_path": "assets/cleanser.png",
                "primary_image_mime_type": "image/png",
                "primary_image_sha256": image_sha256,
            },
            {
                "catalog_code": "synthetic-drug-gel-v1",
                "brand_name": "合成药品品牌",
                "official_name": "合成药品凝胶",
                "product_category": "topical_gel",
                "formula_version": "v1",
                "key_strength": "1% synthetic",
                "regulatory_type": "drug",
                "registration_number": "SYN-DRUG-001",
                "market_region": "CN",
                "status": "active",
                "primary_image_path": "assets/gel.png",
                "primary_image_mime_type": "image/png",
                "primary_image_sha256": image_sha256,
            },
            {
                "catalog_code": "synthetic-device-patch-v1",
                "brand_name": "合成器械品牌",
                "official_name": "合成器械贴",
                "product_category": "medical_patch",
                "formula_version": "model-v1",
                "key_strength": "",
                "regulatory_type": "medical_device",
                "registration_number": "SYN-DEVICE-001",
                "market_region": "CN",
                "status": "active",
                "primary_image_path": "assets/device.png",
                "primary_image_mime_type": "image/png",
                "primary_image_sha256": image_sha256,
            },
        ],
    )
    _write_csv(
        root / "aliases.csv",
        ["catalog_code", "alias", "language"],
        [
            {
                "catalog_code": "synthetic-cleanser-v1",
                "alias": "Synthetic Cleanser",
                "language": "en",
            },
            {
                "catalog_code": "synthetic-cleanser-v1",
                "alias": "hecheng jiemian",
                "language": "pinyin",
            },
            {
                "catalog_code": "synthetic-drug-gel-v1",
                "alias": "合成凝胶",
                "language": "zh-CN",
            },
            {
                "catalog_code": "synthetic-device-patch-v1",
                "alias": "Synthetic Device Patch",
                "language": "en",
            },
        ],
    )
    _write_csv(
        root / "documents.csv",
        [
            "catalog_code",
            "market_region",
            "language",
            "document_version",
            "effective_date",
            "registration_number",
            "source_name",
            "source_url",
            "indications_original_text",
            "source_document_path",
            "content_sha256",
            "is_current",
        ],
        [
            {
                "catalog_code": "synthetic-drug-gel-v1",
                "market_region": "CN",
                "language": "zh-CN",
                "document_version": "2026-01",
                "effective_date": "2026-01-01",
                "registration_number": "SYN-DRUG-001",
                "source_name": "合成监管来源",
                "source_url": "https://invalid.example/drug-fixture",
                "indications_original_text": "仅用于自动化测试的合成适应症原文",
                "source_document_path": "assets/drug-document.txt",
                "content_sha256": hashlib.sha256(drug_document).hexdigest(),
                "is_current": "true",
            },
            {
                "catalog_code": "synthetic-device-patch-v1",
                "market_region": "CN",
                "language": "zh-CN",
                "document_version": "2026-01",
                "effective_date": "2026-01-01",
                "registration_number": "SYN-DEVICE-001",
                "source_name": "合成监管来源",
                "source_url": "https://invalid.example/device-fixture",
                "indications_original_text": "仅用于自动化测试的合成器械适用范围原文",
                "source_document_path": "assets/device-document.txt",
                "content_sha256": hashlib.sha256(device_document).hexdigest(),
                "is_current": "true",
            },
        ],
    )
    return root


def _mutate_csv(package: Path, filename: str, mutation) -> None:
    path = package / filename
    fieldnames, rows = _read_csv(path)
    mutation(rows)
    _write_csv(path, fieldnames, rows)


def test_dry_run_validates_without_database_or_storage_writes(tmp_path: Path) -> None:
    package = validate_catalog_package(_write_valid_package(tmp_path / "catalog"))
    database = _WriteGuard()
    storage = _WriteGuard()

    report = import_catalog(database, storage, package, dry_run=True)

    assert report.model_dump() == {
        "valid": True,
        "catalog_version": "synthetic-v1",
        "products": 3,
        "aliases": 4,
        "documents": 2,
        "images": 3,
        "errors": [],
    }
    assert database.writes == []
    assert storage.writes == []


def test_stage_catalog_assets_uses_content_hash_keys_and_deduplicates(tmp_path: Path) -> None:
    package = validate_catalog_package(_write_valid_package(tmp_path / "catalog"))
    storage = _MemoryStorage()

    staged = stage_catalog_assets(storage, package)

    image_sha256 = hashlib.sha256(_png_bytes()).hexdigest()
    drug_bytes = "仅用于自动化测试的合成药品说明书原始文件。\n".encode()
    device_bytes = "仅用于自动化测试的合成器械资料原始文件。\n".encode()
    drug_sha256 = hashlib.sha256(drug_bytes).hexdigest()
    device_sha256 = hashlib.sha256(device_bytes).hexdigest()
    expected = {
        f"product-images/catalog/{image_sha256[:2]}/{image_sha256}.png": (
            "image",
            "image/png",
            _png_bytes(),
        ),
        f"product-documents/catalog/{drug_sha256[:2]}/{drug_sha256}.txt": (
            "document",
            "application/octet-stream",
            drug_bytes,
        ),
        f"product-documents/catalog/{device_sha256[:2]}/{device_sha256}.txt": (
            "document",
            "application/octet-stream",
            device_bytes,
        ),
    }
    assert {asset.key: (asset.asset_type, asset.content_type, asset.data) for asset in staged} == expected
    assert storage.objects == {key: expected_item[2] for key, expected_item in expected.items()}
    assert len(storage.puts) == 3


def test_stage_catalog_assets_rejects_corrupt_existing_content_hash_key(tmp_path: Path) -> None:
    package = validate_catalog_package(_write_valid_package(tmp_path / "catalog"))
    storage = _MemoryStorage()
    image_sha256 = hashlib.sha256(_png_bytes()).hexdigest()
    image_key = f"product-images/catalog/{image_sha256[:2]}/{image_sha256}.png"
    storage.objects[image_key] = b"corrupt-existing-object"

    with pytest.raises(ValueError, match="existing catalog asset hash mismatch"):
        stage_catalog_assets(storage, package)

    assert storage.objects[image_key] == b"corrupt-existing-object"
    assert storage.puts == []


def test_repository_v1_fixture_is_synthetic_and_valid() -> None:
    package = validate_catalog_package(CATALOG_FIXTURE_ROOT / "v1")

    assert package.manifest.catalog_version == "synthetic-v1"
    assert len(package.products) == 3
    assert len(package.aliases) == 4
    assert len(package.documents) == 2
    assert all(product.catalog_code.startswith("synthetic-") for product in package.products)
    assert all(
        document.source_url is not None and "invalid.example" in document.source_url
        for document in package.documents
    )


def test_package_fingerprint_changes_when_valid_catalog_content_changes(tmp_path: Path) -> None:
    first_root = _write_valid_package(tmp_path / "first")
    second_root = _write_valid_package(tmp_path / "second")
    _mutate_csv(
        second_root,
        "products.csv",
        lambda rows: rows[0].update(official_name="合成洁面更新名"),
    )

    first = validate_catalog_package(first_root)
    repeated = validate_catalog_package(first_root)
    changed = validate_catalog_package(second_root)

    assert repeated.manifest_sha256 == first.manifest_sha256
    assert changed.manifest_sha256 != first.manifest_sha256


@pytest.mark.parametrize(
    ("mutation", "message"),
    [
        (
            lambda package: _mutate_csv(
                package,
                "products.csv",
                lambda rows: rows[0].update(primary_image_path=""),
            ),
            "primary image is required",
        ),
        (
            lambda package: _mutate_csv(
                package,
                "products.csv",
                lambda rows: rows.append(dict(rows[0])),
            ),
            "duplicate catalog_code",
        ),
        (
            lambda package: _mutate_csv(
                package,
                "documents.csv",
                lambda rows: rows[0].update(source_name=""),
            ),
            "official document source is required",
        ),
        (
            lambda package: _mutate_csv(
                package,
                "products.csv",
                lambda rows: rows[0].update(primary_image_sha256="0" * 64),
            ),
            "sha256 mismatch",
        ),
        (
            lambda package: _mutate_csv(
                package,
                "products.csv",
                lambda rows: rows[0].update(primary_image_path="../outside.png"),
            ),
            "path must stay inside catalog package",
        ),
        (
            lambda package: _mutate_csv(
                package,
                "products.csv",
                lambda rows: rows[0].update(official_name=" "),
            ),
            "official_name",
        ),
        (
            lambda package: _mutate_csv(
                package,
                "products.csv",
                lambda rows: rows[0].update(official_name="---"),
            ),
            "official_name must contain searchable characters",
        ),
        (
            lambda package: _mutate_csv(
                package,
                "products.csv",
                lambda rows: rows[0].update(brand_name="ß" * 100),
            ),
            "normalized brand_name exceeds 180 characters",
        ),
        (
            lambda package: _mutate_csv(
                package,
                "products.csv",
                lambda rows: rows[0].update(formula_version=""),
            ),
            "formula_version",
        ),
        (
            lambda package: _mutate_csv(
                package,
                "products.csv",
                lambda rows: rows[0].update(regulatory_type="supplement"),
            ),
            "unsupported regulatory_type",
        ),
        (
            lambda package: _mutate_csv(
                package,
                "products.csv",
                lambda rows: rows[0].update(primary_image_mime_type="image/jpeg"),
            ),
            "MIME does not match",
        ),
        (
            lambda package: _mutate_csv(
                package,
                "aliases.csv",
                lambda rows: rows.append(
                    {
                        "catalog_code": "synthetic-cleanser-v1",
                        "alias": "ＳＹＮＴＨＥＴＩＣ　ＣＬＥＡＮＳＥＲ",
                        "language": "en",
                    }
                ),
            ),
            "duplicate normalized alias",
        ),
        (
            lambda package: _mutate_csv(
                package,
                "aliases.csv",
                lambda rows: rows[0].update(alias="ß" * 121),
            ),
            "normalized alias exceeds 240 characters",
        ),
        (
            lambda package: _mutate_csv(
                package,
                "documents.csv",
                lambda rows: rows[0].update(content_sha256="f" * 64),
            ),
            "sha256 mismatch",
        ),
    ],
)
def test_invalid_package_is_rejected(tmp_path: Path, mutation, message: str) -> None:
    package = _write_valid_package(tmp_path / "catalog")
    mutation(package)

    with pytest.raises(ValueError, match=message):
        validate_catalog_package(package)


def test_manifest_rejects_unknown_fields_and_path_traversal(tmp_path: Path) -> None:
    package = _write_valid_package(tmp_path / "catalog")
    manifest_path = package / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest["unexpected"] = "not allowed"
    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
    with pytest.raises(ValueError, match="unexpected"):
        validate_catalog_package(package)

    manifest.pop("unexpected")
    manifest["products_file"] = "../products.csv"
    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
    with pytest.raises(ValueError, match="path must stay inside catalog package"):
        validate_catalog_package(package)


def test_cli_dry_run_prints_counts_without_source_material(tmp_path: Path) -> None:
    package = _write_valid_package(tmp_path / "catalog")

    completed = subprocess.run(
        [
            sys.executable,
            str(BACKEND_ROOT / "scripts" / "import_standard_products.py"),
            "--source",
            str(package),
            "--dry-run",
        ],
        cwd=BACKEND_ROOT,
        check=False,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )

    assert completed.returncode == 0
    report = json.loads(completed.stdout)
    assert report == {
        "valid": True,
        "catalog_version": "synthetic-v1",
        "products": 3,
        "aliases": 4,
        "documents": 2,
        "images": 3,
        "errors": [],
    }
    assert "invalid.example" not in completed.stdout
    assert "合成适应症原文" not in completed.stdout
    assert completed.stderr == ""


def test_cli_validation_error_does_not_echo_private_source_values(tmp_path: Path) -> None:
    package = _write_valid_package(tmp_path / "catalog")
    _mutate_csv(
        package,
        "documents.csv",
        lambda rows: rows[0].update(
            source_url="https://private.example/" + "secret-token-" * 50,
        ),
    )

    completed = subprocess.run(
        [
            sys.executable,
            str(BACKEND_ROOT / "scripts" / "import_standard_products.py"),
            "--source",
            str(package),
            "--dry-run",
        ],
        cwd=BACKEND_ROOT,
        check=False,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )

    assert completed.returncode == 1
    report = json.loads(completed.stdout)
    assert report["valid"] is False
    assert report["errors"]
    assert "private.example" not in completed.stdout
    assert "secret-token" not in completed.stdout
    assert completed.stderr == ""
