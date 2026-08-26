from __future__ import annotations

import os
import re
from uuid import uuid4

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import IntegrityError

from app.config import BACKEND_ROOT, get_settings


def _database_url() -> str | None:
    return os.getenv("TEST_DATABASE_URL") or get_settings().database_url


def _config() -> Config:
    config = Config(str(BACKEND_ROOT / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_ROOT / "app" / "db" / "migrations"))
    return config


def _count_rows(connection, table_name: str) -> int:  # type: ignore[no-untyped-def]
    quoted_table = connection.dialect.identifier_preparer.quote(table_name)
    return connection.scalar(text(f"SELECT count(*) FROM {quoted_table}"))


def _prepare_alembic_connection(
    monkeypatch: pytest.MonkeyPatch,
    *,
    database_url: str,
    schema: str,
) -> None:
    monkeypatch.setenv("DATABASE_URL", database_url)
    monkeypatch.setenv("PGOPTIONS", f"-csearch_path={schema}")
    get_settings.cache_clear()


def _assert_migration_connection(
    engine,  # type: ignore[no-untyped-def]
    *,
    database_name: str | None,
    schema: str,
    revision: str,
) -> None:
    with engine.connect() as connection:
        assert connection.scalar(text("SELECT current_database()")) == database_name
        assert connection.scalar(text("SELECT current_schema()")) == schema
        assert connection.scalar(text("SELECT version_num FROM alembic_version")) == revision


def _assert_integrity_error(
    connection,  # type: ignore[no-untyped-def]
    statement: str,
    parameters: dict[str, object],
) -> None:
    with pytest.raises(IntegrityError):
        with connection.begin_nested():
            connection.execute(text(statement), parameters)


def _assert_legacy_product_backfill(
    connection,  # type: ignore[no-untyped-def]
    *,
    expected_normalized_names: dict[int, str],
    expected_snapshots: dict[tuple[int, int], str],
) -> None:
    products = connection.execute(
        text(
            "SELECT id, normalized_name, standard_product_id "
            "FROM personal_products ORDER BY id"
        )
    ).all()
    assert {product_id: normalized_name for product_id, normalized_name, _ in products} == (
        expected_normalized_names
    )
    assert all(normalized_name and len(normalized_name) <= 180 for _, normalized_name, _ in products)
    assert all(standard_product_id is None for _, _, standard_product_id in products)
    snapshots = connection.execute(
        text(
            "SELECT product_use_id, product_id, name_snapshot "
            "FROM product_use_products ORDER BY product_use_id, product_id"
        )
    ).all()
    assert {(product_use_id, product_id): snapshot for product_use_id, product_id, snapshot in snapshots} == (
        expected_snapshots
    )


def test_0018_round_trip_preserves_0017_tables_and_catalog_constraints(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    database_url = _database_url()
    if database_url is None:
        pytest.skip("TEST_DATABASE_URL or configured local PostgreSQL is required")

    schema = f"catalog_task_1_{uuid4().hex}"
    if not re.fullmatch(r"[a-z0-9_]+", schema):
        raise AssertionError("generated schema name is unsafe")
    database_name = make_url(database_url).database
    admin_engine = create_engine(database_url, future=True, isolation_level="AUTOCOMMIT")
    config = _config()
    engine = create_engine(
        database_url,
        future=True,
        connect_args={"options": f"-csearch_path={schema}"},
    )
    previous_database_url = os.getenv("DATABASE_URL")
    previous_pgoptions = os.getenv("PGOPTIONS")
    try:
        with admin_engine.connect() as connection:
            connection.execute(text(f"CREATE SCHEMA {schema}"))

        _prepare_alembic_connection(monkeypatch, database_url=database_url, schema=schema)
        command.upgrade(config, "0017_life_contexts")
        _assert_migration_connection(
            engine,
            database_name=database_name,
            schema=schema,
            revision="0017_life_contexts",
        )
        with engine.begin() as connection:
            user_id = connection.scalar(
                text("INSERT INTO users (nickname) VALUES ('catalog legacy fixture') RETURNING id")
            )
            legacy_product_names = {
                "ordinary": "Legacy Product!",
                "expanding": "ß" * 120,
            }
            product_ids = {
                kind: connection.scalar(
                    text(
                        "INSERT INTO personal_products (user_id, client_request_id, name) "
                        "VALUES (:user_id, :request_id, :name) RETURNING id"
                    ),
                    {
                        "user_id": user_id,
                        "request_id": str(uuid4()),
                        "name": name,
                    },
                )
                for kind, name in legacy_product_names.items()
            }
            product_use_ids = {
                kind: connection.scalar(
                    text(
                        "INSERT INTO product_uses "
                        "(user_id, client_request_id, used_at, used_timezone_offset_minutes) "
                        "VALUES (:user_id, :request_id, now(), 0) RETURNING id"
                    ),
                    {"user_id": user_id, "request_id": str(uuid4())},
                )
                for kind in product_ids
            }
            expected_snapshots = {
                (product_use_ids[kind], product_id): legacy_product_names[kind]
                for kind, product_id in product_ids.items()
            }
            for (product_use_id, product_id), _ in expected_snapshots.items():
                connection.execute(
                    text(
                        "INSERT INTO product_use_products (product_use_id, product_id) "
                        "VALUES (:product_use_id, :product_id)"
                    ),
                    {"product_use_id": product_use_id, "product_id": product_id},
                )
            expected_normalized_names = {
                product_ids["ordinary"]: "legacyproduct",
                product_ids["expanding"]: "s" * 180,
            }
            legacy_tables = set(inspect(engine).get_table_names())
            preserved = {table: _count_rows(connection, table) for table in legacy_tables}

        _prepare_alembic_connection(monkeypatch, database_url=database_url, schema=schema)
        command.upgrade(config, "0018_standard_product_catalog")
        _assert_migration_connection(
            engine,
            database_name=database_name,
            schema=schema,
            revision="0018_standard_product_catalog",
        )
        inspector = inspect(engine)
        assert {
            "catalog_import_batches",
            "product_image_assets",
            "standard_products",
            "standard_product_aliases",
            "standard_product_documents",
            "product_asset_cleanup",
        } <= set(inspector.get_table_names())
        trigram_indexes = {
            "standard_products": {
                "ix_standard_products_normalized_brand_name_trgm": "normalized_brand_name",
                "ix_standard_products_normalized_official_name_trgm": "normalized_official_name",
            },
            "standard_product_aliases": {
                "ix_standard_product_aliases_normalized_alias_trgm": "normalized_alias",
            },
        }
        for table, expected_indexes in trigram_indexes.items():
            indexes = {index["name"]: index for index in inspector.get_indexes(table)}
            for index_name, column_name in expected_indexes.items():
                dialect_options = indexes[index_name]["dialect_options"]
                assert dialect_options["postgresql_using"] == "gin"
                assert dialect_options["postgresql_ops"] == {column_name: "gin_trgm_ops"}
        with engine.connect() as connection:
            for expected_indexes in trigram_indexes.values():
                for index_name in expected_indexes:
                    index_definition = connection.scalar(
                        text(
                            "SELECT indexdef FROM pg_indexes "
                            "WHERE schemaname = :schema AND indexname = :index_name"
                        ),
                        {"schema": schema, "index_name": index_name},
                    )
                    assert "USING gin" in index_definition
                    assert "gin_trgm_ops" in index_definition

        with engine.begin() as connection:
            batch_id = connection.scalar(
                text(
                    "INSERT INTO catalog_import_batches "
                    "(catalog_version, manifest_sha256, source_name) "
                    "VALUES ('synthetic-v1', :hash, 'synthetic fixture') RETURNING id"
                ),
                {"hash": "b" * 64},
            )
            image_id = connection.scalar(
                text(
                    "INSERT INTO product_image_assets "
                    "(storage_key, mime_type, byte_size, width, height, sha256, source_type) "
                    "VALUES ('product-images/catalog/synthetic.jpg', 'image/jpeg', 12, 2, 2, :hash, 'catalog') "
                    "RETURNING id"
                ),
                {"hash": "c" * 64},
            )
            connection.execute(
                text(
                    "INSERT INTO product_image_assets "
                    "(storage_key, mime_type, byte_size, width, height, sha256, source_type, "
                    "owner_user_id) VALUES ('product-images/users/synthetic.jpg', 'image/jpeg', 12, "
                    "2, 2, :hash, 'user', :user_id)"
                ),
                {"hash": "u" * 64, "user_id": user_id},
            )
            cosmetic_id = connection.scalar(
                text(
                    "INSERT INTO standard_products "
                    "(catalog_code, brand_name, official_name, normalized_brand_name, "
                    "normalized_official_name, product_category, formula_version, regulatory_type, "
                    "market_region, primary_image_asset_id, status, import_batch_id) "
                    "VALUES ('synthetic-cosmetic-v1', 'Synthetic', 'Synthetic Cleanser', 'synthetic', "
                    "'syntheticcleanser', 'cleanser', 'v1', 'cosmetic', 'CN', :image_id, 'active', "
                    ":batch_id) RETURNING id"
                ),
                {"image_id": image_id, "batch_id": batch_id},
            )
            drug_id = connection.scalar(
                text(
                    "INSERT INTO standard_products "
                    "(catalog_code, brand_name, official_name, normalized_brand_name, "
                    "normalized_official_name, product_category, formula_version, regulatory_type, "
                    "market_region, primary_image_asset_id, status, import_batch_id) "
                    "VALUES ('synthetic-drug-v1', 'Synthetic', 'Synthetic Drug', 'synthetic', "
                    "'syntheticdrug', 'medicine', 'v1', 'drug', 'CN', :image_id, 'active', :batch_id) "
                    "RETURNING id"
                ),
                {"image_id": image_id, "batch_id": batch_id},
            )
            connection.execute(
                text(
                    "INSERT INTO standard_product_documents "
                    "(standard_product_id, market_region, language, regulatory_type, document_version, "
                    "source_name, source_url, indications_original_text, content_sha256, is_current, "
                    "import_batch_id) VALUES "
                    "(:cosmetic_id, 'CN', 'zh-CN', 'cosmetic', '2026-01', 'Synthetic source', "
                    "'https://invalid.example/cosmetic', NULL, :cosmetic_hash, true, :batch_id), "
                    "(:drug_id, 'CN', 'zh-CN', 'drug', '2026-01', 'Synthetic source', "
                    "'https://invalid.example/drug', 'Synthetic test indications only', :drug_hash, true, "
                    ":batch_id)"
                ),
                {
                    "cosmetic_id": cosmetic_id,
                    "drug_id": drug_id,
                    "cosmetic_hash": "d" * 64,
                    "drug_hash": "e" * 64,
                    "batch_id": batch_id,
                },
            )
            connection.execute(
                text(
                    "INSERT INTO standard_product_aliases "
                    "(standard_product_id, alias, normalized_alias, import_batch_id) "
                    "VALUES (:product_id, 'Synthetic Alias', 'syntheticalias', :batch_id)"
                ),
                {"product_id": cosmetic_id, "batch_id": batch_id},
            )

            _assert_integrity_error(
                connection,
                "INSERT INTO catalog_import_batches (catalog_version, manifest_sha256, source_name) "
                "VALUES ('bad-hash', :hash, 'synthetic')",
                {"hash": "a" * 63},
            )
            _assert_integrity_error(
                connection,
                "INSERT INTO catalog_import_batches (catalog_version, manifest_sha256, source_name) "
                "VALUES ('source-blank', :hash, ' ')",
                {"hash": "m" * 64},
            )
            _assert_integrity_error(
                connection,
                "INSERT INTO product_image_assets "
                "(storage_key, mime_type, byte_size, width, height, sha256, source_type) "
                "VALUES ('bad-image-sha', 'image/jpeg', 1, 1, 1, :hash, 'catalog')",
                {"hash": "i" * 63},
            )
            _assert_integrity_error(
                connection,
                "INSERT INTO product_image_assets "
                "(storage_key, mime_type, byte_size, width, height, sha256, source_type) "
                "VALUES ('bad-byte-size', 'image/jpeg', 0, 1, 1, :hash, 'catalog')",
                {"hash": "j" * 64},
            )
            _assert_integrity_error(
                connection,
                "INSERT INTO product_image_assets "
                "(storage_key, mime_type, byte_size, width, height, sha256, source_type) "
                "VALUES ('bad-width', 'image/jpeg', 1, 0, 1, :hash, 'catalog')",
                {"hash": "k" * 64},
            )
            _assert_integrity_error(
                connection,
                "INSERT INTO product_image_assets "
                "(storage_key, mime_type, byte_size, width, height, sha256, source_type) "
                "VALUES ('bad-height', 'image/jpeg', 1, 1, 0, :hash, 'catalog')",
                {"hash": "l" * 64},
            )
            _assert_integrity_error(
                connection,
                "INSERT INTO product_image_assets "
                "(storage_key, mime_type, byte_size, width, height, sha256, source_type) "
                "VALUES ('bad-source-type', 'image/jpeg', 1, 1, 1, :hash, 'unknown')",
                {"hash": "n" * 64},
            )
            _assert_integrity_error(
                connection,
                "INSERT INTO product_image_assets "
                "(storage_key, mime_type, byte_size, width, height, sha256, source_type, "
                "owner_user_id) VALUES ('catalog-has-owner', 'image/jpeg', 1, 1, 1, :hash, "
                "'catalog', :user_id)",
                {"hash": "o" * 64, "user_id": user_id},
            )
            _assert_integrity_error(
                connection,
                "INSERT INTO product_image_assets "
                "(storage_key, mime_type, byte_size, width, height, sha256, source_type) "
                "VALUES ('user-has-no-owner', 'image/jpeg', 1, 1, 1, :hash, 'user')",
                {"hash": "p" * 64},
            )
            product_statement = (
                "INSERT INTO standard_products "
                "(catalog_code, brand_name, official_name, normalized_brand_name, "
                "normalized_official_name, product_category, formula_version, regulatory_type, "
                "market_region, primary_image_asset_id, status, import_batch_id) VALUES "
                "(:catalog_code, :brand_name, 'Synthetic', 'synthetic', 'synthetic', 'cleanser', "
                "'v1', :regulatory_type, 'CN', :image_id, :status, :batch_id)"
            )
            _assert_integrity_error(
                connection,
                "INSERT INTO standard_products "
                "(catalog_code, brand_name, official_name, normalized_brand_name, "
                "normalized_official_name, product_category, formula_version, regulatory_type, "
                "market_region, primary_image_asset_id, status, import_batch_id) "
                "VALUES ('synthetic-cosmetic-v1', 'Synthetic', 'Different Name', 'synthetic', "
                "'differentname', 'cleanser', 'v2', 'cosmetic', 'CN', :image_id, 'active', "
                ":batch_id)",
                {"image_id": image_id, "batch_id": batch_id},
            )
            _assert_integrity_error(
                connection,
                "INSERT INTO standard_products "
                "(catalog_code, brand_name, official_name, normalized_brand_name, "
                "normalized_official_name, product_category, formula_version, regulatory_type, "
                "market_region, primary_image_asset_id, status, import_batch_id) "
                "VALUES ('blank-official-name', 'Synthetic', ' ', 'synthetic', "
                "'blankofficialname', 'cleanser', 'v1', 'cosmetic', 'CN', :image_id, 'active', "
                ":batch_id)",
                {"image_id": image_id, "batch_id": batch_id},
            )
            _assert_integrity_error(
                connection,
                product_statement,
                {
                    "catalog_code": "bad-product-regulatory",
                    "brand_name": "Synthetic",
                    "regulatory_type": "invalid",
                    "image_id": image_id,
                    "status": "active",
                    "batch_id": batch_id,
                },
            )
            _assert_integrity_error(
                connection,
                product_statement,
                {
                    "catalog_code": "bad-product-status",
                    "brand_name": "Synthetic",
                    "regulatory_type": "cosmetic",
                    "image_id": image_id,
                    "status": "unknown",
                    "batch_id": batch_id,
                },
            )
            _assert_integrity_error(
                connection,
                product_statement,
                {
                    "catalog_code": "blank-product-name",
                    "brand_name": " ",
                    "regulatory_type": "cosmetic",
                    "image_id": image_id,
                    "status": "active",
                    "batch_id": batch_id,
                },
            )
            _assert_integrity_error(
                connection,
                "INSERT INTO standard_product_aliases "
                "(standard_product_id, alias, normalized_alias, import_batch_id) "
                "VALUES (:product_id, 'Alias Duplicate', 'syntheticalias', :batch_id)",
                {"product_id": cosmetic_id, "batch_id": batch_id},
            )
            document_statement = (
                "INSERT INTO standard_product_documents "
                "(standard_product_id, market_region, language, regulatory_type, document_version, "
                "source_name, source_url, content_sha256, is_current, import_batch_id) VALUES "
                "(:product_id, 'CN', 'zh-CN', :regulatory_type, :document_version, :source_name, "
                ":source_url, :hash, :is_current, :batch_id)"
            )
            _assert_integrity_error(
                connection,
                document_statement,
                {
                    "product_id": cosmetic_id,
                    "regulatory_type": "invalid",
                    "document_version": "2026-invalid-regulatory",
                    "source_name": "Synthetic source",
                    "source_url": "https://invalid.example/source",
                    "hash": "q" * 64,
                    "is_current": False,
                    "batch_id": batch_id,
                },
            )
            _assert_integrity_error(
                connection,
                document_statement,
                {
                    "product_id": cosmetic_id,
                    "regulatory_type": "cosmetic",
                    "document_version": "2026-blank-source",
                    "source_name": " ",
                    "source_url": "https://invalid.example/source",
                    "hash": "r" * 64,
                    "is_current": False,
                    "batch_id": batch_id,
                },
            )
            _assert_integrity_error(
                connection,
                document_statement,
                {
                    "product_id": cosmetic_id,
                    "regulatory_type": "cosmetic",
                    "document_version": "2026-blank-url",
                    "source_name": "Synthetic source",
                    "source_url": " ",
                    "hash": "s" * 64,
                    "is_current": False,
                    "batch_id": batch_id,
                },
            )
            _assert_integrity_error(
                connection,
                document_statement,
                {
                    "product_id": cosmetic_id,
                    "regulatory_type": "cosmetic",
                    "document_version": "2026-short-hash",
                    "source_name": "Synthetic source",
                    "source_url": "https://invalid.example/source",
                    "hash": "t" * 63,
                    "is_current": False,
                    "batch_id": batch_id,
                },
            )
            _assert_integrity_error(
                connection,
                document_statement,
                {
                    "product_id": cosmetic_id,
                    "regulatory_type": "cosmetic",
                    "document_version": "2026-01",
                    "source_name": "Synthetic source",
                    "source_url": "https://invalid.example/source",
                    "hash": "v" * 64,
                    "is_current": False,
                    "batch_id": batch_id,
                },
            )
            _assert_integrity_error(
                connection,
                document_statement,
                {
                    "product_id": cosmetic_id,
                    "regulatory_type": "cosmetic",
                    "document_version": "2026-second-current",
                    "source_name": "Synthetic source",
                    "source_url": "https://invalid.example/source",
                    "hash": "w" * 64,
                    "is_current": True,
                    "batch_id": batch_id,
                },
            )

        _prepare_alembic_connection(monkeypatch, database_url=database_url, schema=schema)
        command.upgrade(config, "0019_personal_product_links")
        _assert_migration_connection(
            engine,
            database_name=database_name,
            schema=schema,
            revision="0019_personal_product_links",
        )
        inspector = inspect(engine)
        assert {
            "standard_product_id",
            "display_name_override",
            "normalized_name",
            "user_image_asset_id",
        } <= {column["name"] for column in inspector.get_columns("personal_products")}
        assert {
            "name_snapshot",
            "brand_snapshot",
            "formula_version_snapshot",
            "image_asset_id_snapshot",
            "document_id_snapshot",
        } <= {column["name"] for column in inspector.get_columns("product_use_products")}
        personal_product_indexes = {
            index["name"]: index for index in inspector.get_indexes("personal_products")
        }
        assert personal_product_indexes["uq_personal_products_user_standard_active"]["unique"]
        with engine.connect() as connection:
            unique_index_definition = connection.scalar(
                text(
                    "SELECT indexdef FROM pg_indexes "
                    "WHERE schemaname = :schema "
                    "AND indexname = 'uq_personal_products_user_standard_active'"
                ),
                {"schema": schema},
            )
            assert "WHERE (standard_product_id IS NOT NULL)" in unique_index_definition
            _assert_legacy_product_backfill(
                connection,
                expected_normalized_names=expected_normalized_names,
                expected_snapshots=expected_snapshots,
            )

        _prepare_alembic_connection(monkeypatch, database_url=database_url, schema=schema)
        command.downgrade(config, "0017_life_contexts")
        _assert_migration_connection(
            engine,
            database_name=database_name,
            schema=schema,
            revision="0017_life_contexts",
        )
        assert "standard_products" not in inspect(engine).get_table_names()
        with engine.begin() as connection:
            assert legacy_tables <= set(inspect(engine).get_table_names())
            assert {table: _count_rows(connection, table) for table in legacy_tables} == preserved
        _prepare_alembic_connection(monkeypatch, database_url=database_url, schema=schema)
        command.upgrade(config, "0019_personal_product_links")
        _assert_migration_connection(
            engine,
            database_name=database_name,
            schema=schema,
            revision="0019_personal_product_links",
        )
        with engine.connect() as connection:
            _assert_legacy_product_backfill(
                connection,
                expected_normalized_names=expected_normalized_names,
                expected_snapshots=expected_snapshots,
            )
    finally:
        if previous_database_url is None:
            monkeypatch.delenv("DATABASE_URL", raising=False)
        else:
            monkeypatch.setenv("DATABASE_URL", previous_database_url)
        if previous_pgoptions is None:
            monkeypatch.delenv("PGOPTIONS", raising=False)
        else:
            monkeypatch.setenv("PGOPTIONS", previous_pgoptions)
        get_settings.cache_clear()
        engine.dispose()
        with admin_engine.connect() as connection:
            connection.execute(text(f"DROP SCHEMA IF EXISTS {schema} CASCADE"))
        admin_engine.dispose()
