import pytest
from fastapi.testclient import TestClient

from app.api import analyses, lineages
from app.main import app, create_app, settings


def test_health_endpoint() -> None:
    with TestClient(app) as client:
        response = client.get("/health")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_openapi_exposes_tracking_endpoints() -> None:
    with TestClient(app) as client:
        paths = client.get("/openapi.json").json()["paths"]

    assert "/api/v1/auth/register" in paths
    assert "/api/v1/auth/login" in paths
    assert "/api/v1/auth/refresh" in paths
    assert "/api/v1/me/consents" in paths
    assert "/api/v1/observations" in paths
    assert "get" in paths["/api/v1/observations"]
    assert "/api/v1/observations/{observation_id}" in paths
    assert "/api/v1/observations/{observation_id}/targets/{target_id}/note" in paths
    assert "/api/v1/observations/{observation_id}/life-contexts" in paths
    assert "/api/v1/region-events/preview" in paths
    assert "/api/v1/region-events/{event_id}" in paths
    assert "/api/v1/region-events/{event_id}/end" in paths
    assert "/api/v1/products" in paths
    assert "/api/v1/products/{product_id}" in paths
    assert "patch" in paths["/api/v1/products/{product_id}/custom"]
    assert "/api/v1/product-search" in paths
    assert "/api/v1/catalog/products/{standard_product_id}" in paths
    assert "/api/v1/product-uses" in paths
    assert "/api/v1/product-uses/{use_id}" in paths
    assert "/api/v1/timeline" in paths
    assert "/api/v1/photos/{photo_id}/url" in paths
    # 开发环境仍可回看 legacy 接口
    assert "/api/v1/check-ins" in paths
    assert "/api/v1/check-ins/{check_in_id}/diary" in paths
    assert "/api/v1/check-ins/{check_in_id}/analysis-summary" in paths
    assert "/api/v1/check-ins/{check_in_id}/complete" in paths
    assert "/api/v1/lineages" in paths
    assert "/api/v1/lineages/by-check-in/{check_in_id}" in paths
    assert "/api/v1/lineages/{lineage_id}" in paths
    assert "/api/v1/trends/summary" in paths
    assert "/check-ins" not in paths


def test_business_endpoint_requires_bearer_token() -> None:
    with TestClient(app) as client:
        responses = [
            client.get("/api/v1/check-ins"),
            client.get("/api/v1/observations"),
            client.get("/api/v1/observations/1"),
            client.put(
                "/api/v1/observations/1/targets/2/note",
                json={"user_note": "记录"},
            ),
            client.get("/api/v1/region-events"),
            client.get("/api/v1/products"),
            client.get("/api/v1/product-search", params={"q": "合成洁面"}),
            client.get("/api/v1/catalog/products/1"),
            client.get("/api/v1/product-uses"),
            client.get("/api/v1/timeline"),
            client.put(
                "/api/v1/observations/1/life-contexts",
                json={"context_ids": []},
            ),
            client.post(
                "/api/v1/region-events/preview",
                json={
                    "region_ids": ["forehead"],
                    "recorded_at": "2026-08-24T08:00:00Z",
                    "recorded_timezone_offset_minutes": 480,
                },
            ),
        ]

    assert all(response.status_code == 401 for response in responses)
    assert all(response.headers["www-authenticate"] == "Bearer" for response in responses)


def _valid_deployment(monkeypatch, app_env: str = "prod") -> None:
    values = {
        "app_env": app_env,
        "database_url": "postgresql+psycopg://app:secret@db.internal:5432/skin_care",
        "storage_url_sign_secret": "x" * 48,
        "ai_provider_primary": "glm",
        "ai_provider_fallbacks": "",
        "glm_api_key": "test-key",
        "storage_backend": "cos",
        "cos_secret_id": "id",
        "cos_secret_key": "key",
        "cos_region": "ap-shanghai",
        "cos_bucket": "bucket",
    }
    for key, value in values.items():
        monkeypatch.setattr(settings, key, value)


def test_production_app_does_not_mount_debug_or_legacy_routes(monkeypatch) -> None:
    _valid_deployment(monkeypatch)
    prod_app = create_app()

    with TestClient(prod_app) as client:
        paths = client.get("/openapi.json").json()["paths"]

    assert not any("/debug/" in path for path in paths)
    assert "/api/v1/dev/catalog/products" not in paths
    legacy_prefixes = ("/api/v1/check-ins", "/api/v1/analyses", "/api/v1/chat",
                       "/api/v1/lineages", "/api/v1/trends")
    assert not any(path.startswith(legacy_prefixes) for path in paths)
    assert "post" not in paths.get("/api/v1/photos", {})
    assert "/api/v1/photos/{photo_id}/url" in paths
    assert "/api/v1/observations" in paths
    assert "/api/v1/region-events/{event_id}/insights" in paths


def test_non_dev_startup_refuses_development_defaults(monkeypatch) -> None:
    monkeypatch.setattr(settings, "app_env", "staging")
    for key in ("database_url", "storage_url_sign_secret", "ai_provider_primary",
                "ai_provider_fallbacks", "storage_backend"):
        monkeypatch.setattr(settings, key, type(settings).model_fields[key].default)

    errors = settings.deployment_config_errors()

    assert "DATABASE_URL must be configured" in errors
    assert any("STORAGE_URL_SIGN_SECRET" in error for error in errors)
    assert "AI_PROVIDER_PRIMARY must not be mock" in errors
    with pytest.raises(RuntimeError, match="invalid deployment config"):
        with TestClient(create_app()):
            pass


def test_deployment_config_requires_provider_keys_and_cos_in_production(monkeypatch) -> None:
    _valid_deployment(monkeypatch)
    monkeypatch.setattr(settings, "ai_provider_fallbacks", "qwen")
    monkeypatch.setattr(settings, "qwen_api_key", "")
    monkeypatch.setattr(settings, "storage_backend", "local")

    errors = settings.deployment_config_errors()

    assert "QWEN_API_KEY is required" in errors
    assert "production requires STORAGE_BACKEND=cos" in errors


def test_staging_may_use_local_storage_for_single_instance_trials(monkeypatch) -> None:
    _valid_deployment(monkeypatch, app_env="staging")
    monkeypatch.setattr(settings, "storage_backend", "local")

    assert settings.deployment_config_errors() == []


def test_dev_environment_keeps_local_defaults() -> None:
    assert settings.app_env == "dev"
    assert settings.deployment_config_errors() == []


def test_dev_app_mounts_development_catalog_form_route() -> None:
    dev_app = create_app()

    with TestClient(dev_app) as client:
        paths = client.get("/openapi.json").json()["paths"]

    assert "/api/v1/dev/catalog/products" in paths


def test_static_by_photo_routes_precede_dynamic_id_routes() -> None:
    analysis_paths = [route.path for route in analyses.router.routes]
    lineage_paths = [route.path for route in lineages.router.routes]

    assert analysis_paths.index("/analyses/by-photo/{photo_id}") < analysis_paths.index(
        "/analyses/{analysis_id}"
    )
    assert lineage_paths.index("/lineages/by-photo/{photo_id}") < lineage_paths.index(
        "/lineages/{lineage_id}"
    )
    assert lineage_paths.index("/lineages/by-check-in/{check_in_id}") < lineage_paths.index(
        "/lineages/{lineage_id}"
    )
