from scripts import verify_standard_product_catalog_flow as flow


def test_local_catalog_closure_uses_only_catalog_and_compatibility_http_suites() -> None:
    assert flow.CLOSURE_TESTS == (
        "tests/integration/test_standard_product_migration_roundtrip.py",
        "tests/integration/test_standard_product_catalog_http.py",
        "tests/integration/test_product_http_closure.py",
    )


def test_local_catalog_closure_prefers_an_explicit_test_database_url(monkeypatch) -> None:
    monkeypatch.setenv("TEST_DATABASE_URL", "postgresql+psycopg://test.example/catalog")

    assert flow.closure_database_url("postgresql+psycopg://default.example/catalog") == (
        "postgresql+psycopg://test.example/catalog"
    )
