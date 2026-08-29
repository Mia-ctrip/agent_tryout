# Slice 4A Standard Product Catalog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Status:** ACTIVE，仅剩 Task 12 出口验证。
>
> **Progress governance:** 截至 2026-08-29，Task 1–11 已实现，Task 12 尚未通过完整出口门禁。下方复选框保留原始实施与验收配方，不作为当前进度日志；唯一当前状态以 `docs/current_status.md` 为准。

**Goal:** 在保留现有个人产品和使用历史的前提下，实现配方版本级标准产品目录、图片、版本化官方说明书原文、统一模糊搜索、双层引用、用户自建图片和不可改写的产品使用快照。

**Architecture:** 新增独立标准目录领域，目录、别名、图片、说明书和导入批次与现有个人产品领域分离；`PersonalProduct` 通过可空外键引用 `StandardProduct`，`ProductUse` 继续只关联个人产品，并在关联表保存使用时快照。目录由受控离线包幂等导入，移动端通过统一搜索接口组合个人柜和标准目录，不引入推荐或 AI 推断。

**Tech Stack:** FastAPI、Pydantic v2、SQLAlchemy 2、PostgreSQL 16、Alembic、Pillow、pytest；React Native 0.86、Expo SDK 57、Expo Router、TypeScript、expo-image、expo-image-picker。

**Spec:** `docs/superpowers/specs/2026-08-24-standard-product-catalog-design.md`

## Global Constraints

- 产品范围和文案以 `design/product/skin_care_app_mvp_spec.md` 为准；实现前同时读取本计划、批准设计和 `docs/current_status.md`。
- 标准产品身份是配方版本级；不同容量、包装和销售渠道不拆分，同一配方的正式版本或关键浓度不同才拆分。
- 标准产品主图必需且只有一张当前图；用户自建产品图片可空。图片二进制只进对象存储，PostgreSQL 保存不可变资产元数据和引用。
- 普通护肤品、药品和医疗器械均可进入目录；药品和医疗器械没有可核验官方资料时不得启用。普通护肤品没有官方“适应症”时保持为空。
- 【适应症】只保存并展示官方原文、来源和版本，不送入 AI，不生成摘要、推荐、用药建议、疗效、相关性或因果判断。
- 首版只实现版本化离线导入包、`dry-run` 和幂等导入命令；不建设运营后台、不抓取网页、不自动生成别名或监管资料。
- 现有 `personal_products`、`product_uses`、`product_use_products` 和迁移历史必须保留；只在 `0017_life_contexts` 后追加迁移。
- 不安装新的移动端依赖；`expo-image-picker` 与 `expo-image` 已存在。修改原生权限前必须核对 Expo 57 精确版本官方文档。
- 测试目录中的目录包必须是明确标记的合成数据，不能伪装成真实药品说明书。公开测试或生产启用真实目录前，由用户提供来源和使用权明确的导入包。
- 每个写接口继续使用认证、账号隔离、客户端 UUID 幂等和事务；同一用户不能重复加入同一标准产品。
- 计划中的提交步骤只有在用户明确授权 Git commit 时执行；未授权时跳过 commit，运行对应测试和 `git diff --check` 作为可恢复检查点。

---

## File Structure

### Backend catalog domain

- Create `backend/app/models/product_catalog.py`: 标准产品、别名、图片资产、说明书、导入批次和资产清理队列 ORM。
- Modify `backend/app/models/product.py`: 个人产品标准引用、用户图片和产品使用快照字段。
- Modify `backend/app/models/__init__.py`: 注册新 ORM 模型。
- Create `backend/app/db/migrations/versions/0018_standard_product_catalog.py`: 目录基础表、约束、`pg_trgm` 和搜索索引。
- Create `backend/app/db/migrations/versions/0019_personal_product_catalog_links.py`: 个人产品双层引用和使用快照迁移、旧数据回填。
- Create `backend/app/schemas/product_catalog.py`: 搜索、标准详情、标准加入和图片/说明书输出契约。
- Modify `backend/app/schemas/product.py`: 扩展个人产品和产品使用快照 DTO，保留旧字段。
- Create `backend/app/services/product_image_service.py`: 产品图片读取校验、对象键、资产持久化和签名输出。
- Create `backend/app/services/catalog_import_service.py`: 导入包验证、`dry-run`、暂存、幂等写入、停用和清理登记。
- Create `backend/app/services/product_search_service.py`: 搜索归一化、排序、游标和统一搜索查询。
- Modify `backend/app/services/product_service.py`: 从标准目录加入个人柜、用户自建图片、当前展示解析和使用快照。
- Create `backend/app/api/product_catalog.py`: 统一搜索和标准产品详情路由。
- Modify `backend/app/api/products.py`: `from-standard`、`custom` 和扩展输出。
- Modify `backend/app/main.py`: 注册目录路由。
- Create `backend/scripts/import_standard_products.py`: 受控导入 CLI。

### Backend tests and fixtures

- Create `backend/tests/test_standard_product_models.py`.
- Create `backend/tests/test_product_images.py`.
- Create `backend/tests/test_catalog_import.py`.
- Create `backend/tests/test_product_search.py`.
- Modify `backend/tests/test_product_models.py`.
- Modify `backend/tests/integration/test_product_http_closure.py`.
- Create `backend/tests/integration/test_standard_product_migration_roundtrip.py`.
- Create `backend/tests/integration/test_standard_product_catalog_http.py`.
- Create `backend/tests/fixtures/product_catalog/v1/` and `v2/`: 合成目录、别名、图片和说明书 fixtures。

### Mobile

- Modify `mobile/src/lib/product-api.ts`: 标准目录、统一搜索、标准加入、自建 multipart、图片和快照类型。
- Create `mobile/src/lib/product-search-flow.ts`: 搜索输入、代际隔离、去重和加入后选中规则。
- Create `mobile/src/lib/product-image-picker.ts`: 相机/相册结果到上传文件的纯转换边界。
- Create `mobile/src/components/product-image.tsx`: 签名图片与类别占位图。
- Create `mobile/src/components/product-search-result-row.tsx`: 个人/标准搜索项呈现与按钮语义。
- Create `mobile/src/components/product-search-picker.tsx`: 250ms 搜索、分组结果、标准加入和错误降级。
- Create `mobile/src/components/custom-product-form.tsx`: 名称、可选图片、重试和保存。
- Modify `mobile/src/app/(tabs)/products.tsx`: 产品页接入统一搜索和自建流程。
- Modify `mobile/src/app/product-use/new.tsx`: 多选流程接入标准加入和自建产品。
- Modify `mobile/src/app/product/[productId].tsx`: 当前产品图片、标准来源和历史事实。
- Create `mobile/src/app/product-catalog/[standardProductId].tsx`: 标准产品、监管资料和说明书原文详情。
- Modify `mobile/app.json`: 配置 Expo 57 image-picker 的相册与产品拍摄权限文案。
- Modify/add `mobile/tests/product-api.test.mjs`, `product-use-flow.test.mjs`, `product-search-flow.test.mjs`, `product-image-picker.test.mjs`, `product-ui-contract.test.mjs`。

---

### Task 1: Standard Catalog Models and `0018` Migration

**Files:**
- Create: `backend/app/models/product_catalog.py`
- Modify: `backend/app/models/__init__.py`
- Create: `backend/app/db/migrations/versions/0018_standard_product_catalog.py`
- Create: `backend/tests/test_standard_product_models.py`
- Create: `backend/tests/integration/test_standard_product_migration_roundtrip.py`

**Interfaces:**
- Consumes: `Base`, `IdMixin`, `TimestampMixin` from `backend/app/models/base.py`; current Alembic head `0017_life_contexts`.
- Produces: `CatalogImportBatch`, `ProductImageAsset`, `StandardProduct`, `StandardProductAlias`, `StandardProductDocument`, `ProductAssetCleanup`; string constants `REGULATORY_TYPES`, `STANDARD_PRODUCT_STATUSES`, `IMAGE_SOURCE_TYPES`.

- [ ] **Step 1: Write failing model contract tests**

```python
def test_standard_product_uses_formula_level_identity_and_current_image() -> None:
    product = StandardProduct(
        catalog_code="synthetic-cleanser-v1",
        brand_name="合成品牌",
        official_name="合成洁面",
        product_category="cleanser",
        formula_version="v1",
        regulatory_type="cosmetic",
        market_region="CN",
        primary_image_asset_id=7,
        status="active",
        import_batch_id=3,
    )
    assert product.catalog_code == "synthetic-cleanser-v1"
    assert product.regulatory_type == "cosmetic"


def test_document_keeps_indications_source_and_version_separately() -> None:
    document = StandardProductDocument(
        standard_product_id=9,
        market_region="CN",
        language="zh-CN",
        document_version="2026-01",
        source_name="合成监管来源",
        source_url="https://invalid.example/fixture",
        indications_original_text="仅用于自动化测试的合成原文",
        content_sha256="a" * 64,
        is_current=True,
        import_batch_id=3,
    )
    assert document.indications_original_text.startswith("仅用于")
```

- [ ] **Step 2: Run the new tests and verify RED**

Run: `backend/.venv/Scripts/python.exe -m pytest backend/tests/test_standard_product_models.py -q`

Expected: FAIL because `app.models.product_catalog` does not exist.

- [ ] **Step 3: Implement focused ORM models and database constraints**

Use separate classes rather than growing `models/product.py`. The model shape must include these constraints:

```python
REGULATORY_TYPES = ("cosmetic", "drug", "medical_device")
STANDARD_PRODUCT_STATUSES = ("active", "inactive")
IMAGE_SOURCE_TYPES = ("catalog", "user")


class StandardProduct(Base, IdMixin, TimestampMixin):
    __tablename__ = "standard_products"
    catalog_code: Mapped[str] = mapped_column(String(96), unique=True, nullable=False)
    brand_name: Mapped[str] = mapped_column(String(120), nullable=False)
    official_name: Mapped[str] = mapped_column(String(180), nullable=False)
    normalized_brand_name: Mapped[str] = mapped_column(String(180), nullable=False)
    normalized_official_name: Mapped[str] = mapped_column(String(240), nullable=False)
    product_category: Mapped[str] = mapped_column(String(64), nullable=False)
    formula_version: Mapped[str] = mapped_column(String(120), nullable=False)
    key_strength: Mapped[str | None] = mapped_column(String(80))
    regulatory_type: Mapped[str] = mapped_column(String(24), nullable=False)
    registration_number: Mapped[str | None] = mapped_column(String(120))
    market_region: Mapped[str] = mapped_column(String(16), nullable=False)
    primary_image_asset_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("product_image_assets.id", ondelete="RESTRICT"), nullable=False
    )
    status: Mapped[str] = mapped_column(String(16), nullable=False)
    import_batch_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("catalog_import_batches.id", ondelete="RESTRICT"), nullable=False
    )
```

Add database check constraints for enum-like strings, 64-character SHA-256 fields, nonblank names, `byte_size > 0`, `width > 0`, `height > 0`, source/owner consistency, unique `(standard_product_id, normalized_alias)`, unique document version, and one current document per `(standard_product_id, market_region, language)` using a partial unique index.

- [ ] **Step 4: Add `0018_standard_product_catalog`**

The migration must:

```python
revision = "0018_standard_product_catalog"
down_revision = "0017_life_contexts"

def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
```

After the extension statement, create tables in this exact order: `catalog_import_batches`, `product_image_assets`, `standard_products`, `standard_product_aliases`, `standard_product_documents`, `product_asset_cleanup`. Use the exact columns and constraints established in Step 3 and the approved spec. Then create trigram GIN indexes on `standard_products.normalized_brand_name`, `standard_products.normalized_official_name`, and `standard_product_aliases.normalized_alias`. `downgrade()` drops those indexes and tables in reverse order. Do not drop `pg_trgm` during downgrade because it may be shared by another application.

- [ ] **Step 5: Add migration round-trip coverage**

Against `TEST_DATABASE_URL`, upgrade `0017 → 0018`, insert one synthetic cosmetic and one synthetic drug document, assert constraints and indexes, downgrade to `0017`, then upgrade to `0018` again. Verify all pre-existing table row counts remain unchanged.

Run: `$env:RUN_INTEGRATION='1'; backend/.venv/Scripts/python.exe -m pytest backend/tests/integration/test_standard_product_migration_roundtrip.py -q`

Expected: PASS; temporary schema is cleaned in `finally`.

- [ ] **Step 6: Run model tests and Ruff**

Run: `backend/.venv/Scripts/python.exe -m pytest backend/tests/test_standard_product_models.py -q`

Run: `backend/.venv/Scripts/python.exe -m ruff check backend/app/models/product_catalog.py backend/app/models/__init__.py backend/app/db/migrations/versions/0018_standard_product_catalog.py backend/tests/test_standard_product_models.py backend/tests/integration/test_standard_product_migration_roundtrip.py`

- [ ] **Step 7: Save checkpoint**

If commits are authorized:

```bash
git add skin_care_agent/backend/app/models/product_catalog.py skin_care_agent/backend/app/models/__init__.py skin_care_agent/backend/app/db/migrations/versions/0018_standard_product_catalog.py skin_care_agent/backend/tests/test_standard_product_models.py skin_care_agent/backend/tests/integration/test_standard_product_migration_roundtrip.py
git commit -m "feat: add standard product catalog models"
```

Otherwise run `git diff --check` and record the passing commands in `docs/current_status.md` only after the task is GREEN.

---

### Task 2: Personal Product Links and Immutable Use Snapshots

**Files:**
- Modify: `backend/app/models/product.py`
- Create: `backend/app/db/migrations/versions/0019_personal_product_catalog_links.py`
- Modify: `backend/tests/test_product_models.py`
- Modify: `backend/tests/integration/test_standard_product_migration_roundtrip.py`

**Interfaces:**
- Consumes: `StandardProduct`, `ProductImageAsset`, `StandardProductDocument` from Task 1.
- Produces: `PersonalProduct.standard_product_id`, `display_name_override`, `normalized_name`, `user_image_asset_id`; `ProductUseProduct.name_snapshot`, `brand_snapshot`, `formula_version_snapshot`, `image_asset_id_snapshot`, `document_id_snapshot`.

- [ ] **Step 1: Write failing compatibility and snapshot tests**

```python
def test_personal_product_may_reference_standard_or_remain_custom() -> None:
    linked = PersonalProduct(
        user_id=1, client_request_id=uuid4(), name="加入时名称",
        normalized_name="加入时名称", standard_product_id=8,
    )
    custom = PersonalProduct(
        user_id=1, client_request_id=uuid4(), name="我的自建产品",
        normalized_name="我的自建产品", standard_product_id=None,
    )
    assert linked.standard_product_id == 8
    assert custom.standard_product_id is None


def test_use_association_carries_historical_snapshot() -> None:
    link = ProductUseProduct(
        product_use_id=2,
        product_id=3,
        name_snapshot="合成产品旧名",
        brand_snapshot="合成品牌",
        formula_version_snapshot="v1",
        image_asset_id_snapshot=4,
        document_id_snapshot=5,
    )
    assert link.name_snapshot == "合成产品旧名"
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `backend/.venv/Scripts/python.exe -m pytest backend/tests/test_product_models.py -q`

Expected: FAIL on missing fields.

- [ ] **Step 3: Extend ORM models with nullable legacy-safe fields**

```python
class PersonalProduct(Base, IdMixin, TimestampMixin):
    standard_product_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("standard_products.id", ondelete="RESTRICT"), nullable=True
    )
    display_name_override: Mapped[str | None] = mapped_column(String(120))
    normalized_name: Mapped[str] = mapped_column(String(180), nullable=False)
    user_image_asset_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("product_image_assets.id", ondelete="RESTRICT"), nullable=True
    )


class ProductUseProduct(Base):
    name_snapshot: Mapped[str] = mapped_column(String(180), nullable=False)
    brand_snapshot: Mapped[str | None] = mapped_column(String(120))
    formula_version_snapshot: Mapped[str | None] = mapped_column(String(120))
    image_asset_id_snapshot: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("product_image_assets.id", ondelete="RESTRICT"),
        nullable=True,
    )
    document_id_snapshot: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("standard_product_documents.id", ondelete="RESTRICT"),
        nullable=True,
    )
```

- [ ] **Step 4: Add `0019` with deterministic legacy backfill**

Add nullable columns first. Backfill existing `personal_products.normalized_name` using a local NFKC/casefold/punctuation-normalization helper inside the migration; do not import application services into Alembic. Backfill every existing `product_use_products.name_snapshot` from `personal_products.name`. Then make `normalized_name` and `name_snapshot` non-null.

Create partial unique index:

```sql
CREATE UNIQUE INDEX uq_personal_products_user_standard_active
ON personal_products (user_id, standard_product_id)
WHERE standard_product_id IS NOT NULL;
```

Create trigram index for `personal_products.normalized_name`.

- [ ] **Step 5: Verify migration compatibility and round trip**

The integration test must seed legacy personal products and uses at `0017`, upgrade to `0019`, assert all row counts and names are preserved and snapshots are populated, then downgrade to `0017` and upgrade again.

Run: `$env:RUN_INTEGRATION='1'; backend/.venv/Scripts/python.exe -m pytest backend/tests/integration/test_standard_product_migration_roundtrip.py -q`

- [ ] **Step 6: Run focused and full model checks**

Run: `backend/.venv/Scripts/python.exe -m pytest backend/tests/test_product_models.py backend/tests/test_standard_product_models.py -q`

Run: `backend/.venv/Scripts/python.exe -m ruff check backend/app/models/product.py backend/app/db/migrations/versions/0019_personal_product_catalog_links.py backend/tests/test_product_models.py`

- [ ] **Step 7: Save checkpoint**

If authorized: `git commit -am "feat: link personal products to catalog"` after staging the new migration explicitly. Otherwise run `git diff --check`.

---

### Task 3: Product Image Validation and Custom Product Upload

**Files:**
- Create: `backend/app/services/product_image_service.py`
- Modify: `backend/app/schemas/product.py`
- Modify: `backend/app/services/product_service.py`
- Modify: `backend/app/api/products.py`
- Create: `backend/tests/test_product_images.py`
- Modify: `backend/tests/integration/test_product_http_closure.py`

**Interfaces:**
- Consumes: `ProductImageAsset`, existing `StorageBackend`, `get_settings().allowed_mime_set`, `upload_max_bytes`.
- Produces: `ValidatedProductImage(data, mime_type, width, height, sha256, extension)`, `validate_product_image()`, `create_custom_product(db, *, user_id, client_request_id, name, image)`, `POST /api/v1/products/custom` multipart endpoint; expanded `ProductOut` image/source fields.

- [ ] **Step 1: Write failing image and idempotency tests**

```python
def test_product_image_rejects_invalid_bytes() -> None:
    with pytest.raises(HTTPException) as error:
        validate_product_image(b"not-an-image", "image/jpeg")
    assert error.value.status_code == 400


def test_custom_product_retry_reuses_product_and_object(monkeypatch) -> None:
    first = client.post("/api/v1/products/custom", data=form, files=image, headers=headers)
    second = client.post("/api/v1/products/custom", data=form, files=image, headers=headers)
    assert first.status_code == 201
    assert second.status_code == 200
    assert second.json()["product_id"] == first.json()["product_id"]
    assert fake_storage.put_count == 1
```

Also test unsupported MIME, oversized bytes, unreadable image, EXIF orientation dimensions, no-image custom creation, cross-account image URL issuance, and race cleanup.

- [ ] **Step 2: Run tests and verify RED**

Run: `backend/.venv/Scripts/python.exe -m pytest backend/tests/test_product_images.py -q`

Expected: FAIL because service and multipart route are absent.

- [ ] **Step 3: Implement deterministic validation and immutable keys**

```python
@dataclass(frozen=True)
class ValidatedProductImage:
    data: bytes
    mime_type: str
    width: int
    height: int
    sha256: str
    extension: str


def validate_product_image(data: bytes, mime_type: str) -> ValidatedProductImage:
    if mime_type not in {"image/jpeg", "image/png", "image/webp"}:
        raise HTTPException(status_code=400, detail="unsupported product image type")
    if not data or len(data) > get_settings().upload_max_bytes:
        raise HTTPException(status_code=400, detail="invalid product image size")
    try:
        with Image.open(BytesIO(data)) as probe:
            probe.verify()
        with Image.open(BytesIO(data)) as source:
            oriented = ImageOps.exif_transpose(source)
            width, height = oriented.size
            detected_format = source.format
    except (OSError, UnidentifiedImageError) as exc:
        raise HTTPException(status_code=400, detail="unreadable product image") from exc
    extension_by_format = {"JPEG": "jpg", "PNG": "png", "WEBP": "webp"}
    extension = extension_by_format.get(detected_format or "")
    if extension is None:
        raise HTTPException(status_code=400, detail="unsupported product image format")
    return ValidatedProductImage(
        data=data,
        mime_type=mime_type,
        width=width,
        height=height,
        sha256=hashlib.sha256(data).hexdigest(),
        extension=extension,
    )
```

Use `product-images/users/{user_id}/{client_request_id}.{extension}` for user images. Check the idempotency record before reading/storing a retry. On an integrity race, delete only the newly written unreferenced object and return the existing product.

- [ ] **Step 4: Add multipart custom-product endpoint without breaking JSON creation**

```python
@products_router.post("/custom", response_model=ProductOut, status_code=201)
async def create_custom_product_endpoint(
    response: Response,
    client_request_id: UUID = Form(...),
    name: str = Form(...),
    file: UploadFile | None = File(default=None),
    current_user: User = Depends(get_current_app_user),
    db: Session = Depends(get_db),
) -> ProductOut:
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
```

Keep the existing JSON `POST /products` behavior for old clients. Add `source_type`, `standard_product_id`, `brand_name`, `formula_version`, `regulatory_type`, `image_url` and `image_expires_at` as backward-compatible response additions.

- [ ] **Step 5: Verify API and account isolation**

Run: `backend/.venv/Scripts/python.exe -m pytest backend/tests/test_product_images.py backend/tests/integration/test_product_http_closure.py -q`

Run: `backend/.venv/Scripts/python.exe -m ruff check backend/app/services/product_image_service.py backend/app/services/product_service.py backend/app/api/products.py backend/app/schemas/product.py backend/tests/test_product_images.py`

- [ ] **Step 6: Save checkpoint**

If authorized, commit as `feat: add custom product images`; otherwise run `git diff --check`.

---

### Task 4: Catalog Package Validation and Dry Run

**Files:**
- Create: `backend/app/services/catalog_import_service.py`
- Create: `backend/scripts/import_standard_products.py`
- Create: `backend/tests/test_catalog_import.py`
- Create: `backend/tests/fixtures/product_catalog/v1/manifest.json`
- Create: `backend/tests/fixtures/product_catalog/v1/products.csv`
- Create: `backend/tests/fixtures/product_catalog/v1/aliases.csv`
- Create: `backend/tests/fixtures/product_catalog/v1/documents.csv`
- Create: `backend/tests/fixtures/product_catalog/v1/assets/`

**Interfaces:**
- Consumes: `validate_product_image()` from Task 3.
- Produces: `CatalogManifest`, `CatalogProductInput`, `CatalogAliasInput`, `CatalogDocumentInput`, `ValidatedCatalogPackage`, `ImportReport`, `validate_catalog_package(source: Path)`, `import_catalog(db, storage, package, *, dry_run: bool)`, CLI `--source` and `--dry-run`.

- [ ] **Step 1: Write failing package validation tests**

```python
def test_dry_run_validates_without_writing(tmp_path, fake_storage, db) -> None:
    package = copy_fixture("v1", tmp_path)
    validated = validate_catalog_package(package)
    report = import_catalog(db, fake_storage, validated, dry_run=True)
    assert report.valid is True
    assert report.products == 3
    assert fake_storage.puts == []


@pytest.mark.parametrize("mutation, message", [
    ("missing_primary_image", "primary image is required"),
    ("duplicate_catalog_code", "duplicate catalog_code"),
    ("drug_without_official_source", "official document source is required"),
    ("hash_mismatch", "sha256 mismatch"),
])
def test_invalid_package_is_rejected(tmp_path, mutation, message) -> None:
    package = copy_fixture("v1", tmp_path)
    mutate_fixture(package, mutation)
    with pytest.raises(ValueError, match=message):
        validate_catalog_package(package)
```

Fixtures must use synthetic names, generated images and `invalid.example` source URLs. A cosmetic fixture may have empty indications; a drug/device fixture must have source, version and original-text fixture content.

- [ ] **Step 2: Run tests and verify RED**

Run: `backend/.venv/Scripts/python.exe -m pytest backend/tests/test_catalog_import.py -q`

- [ ] **Step 3: Implement strict manifest schemas and normalization**

```python
class CatalogManifest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    catalog_version: str
    generated_at: datetime
    products_file: str
    aliases_file: str
    documents_file: str


def normalize_product_search_text(value: str) -> str:
    normalized = unicodedata.normalize("NFKC", value).casefold().strip()
    return "".join(ch for ch in normalized if ch.isalnum())
```

Validate all relative paths remain inside the package root. Never read URLs or invoke network clients. Reject blank official names, missing formula versions, duplicate codes/aliases, unsupported regulatory types, path traversal, bad image metadata, source-less drug/device documents and mismatched hashes.

- [ ] **Step 4: Implement dry-run CLI**

```python
def main() -> int:
    parser = argparse.ArgumentParser(description="Import a versioned standard-product catalog")
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    report = run_import(source=args.source, dry_run=args.dry_run)
    print(report.model_dump_json(indent=2))
    return 0 if report.valid else 1
```

The report prints counts, version and validation errors only; it must not print image bytes, database credentials or private URLs.

- [ ] **Step 5: Verify dry-run and Ruff**

Run: `backend/.venv/Scripts/python.exe backend/scripts/import_standard_products.py --source backend/tests/fixtures/product_catalog/v1 --dry-run`

Expected: exit 0, synthetic product/alias/document counts, zero database/object writes.

Run: `backend/.venv/Scripts/python.exe -m pytest backend/tests/test_catalog_import.py -q`

Run: `backend/.venv/Scripts/python.exe -m ruff check backend/app/services/catalog_import_service.py backend/scripts/import_standard_products.py backend/tests/test_catalog_import.py`

- [ ] **Step 6: Save checkpoint**

If authorized, commit as `feat: validate standard product imports`; otherwise run `git diff --check`.

---

### Task 5: Idempotent Catalog Persistence, Version Updates, and Cleanup

**Files:**
- Modify: `backend/app/services/catalog_import_service.py`
- Modify: `backend/scripts/import_standard_products.py`
- Modify: `backend/tests/test_catalog_import.py`
- Create: `backend/tests/fixtures/product_catalog/v2/`
- Create: `backend/tests/integration/test_standard_product_catalog_http.py`

**Interfaces:**
- Consumes: validated package and catalog ORM from Tasks 1 and 4.
- Produces: `apply_catalog_package(db, storage, package) -> ImportReport`, `stage_catalog_assets()`, `register_cleanup_keys()`, `_find_import_batch()`, `_persist_catalog_transaction()`, `_report_for_batch()`, immutable image/document version updates and explicit inactive records.

- [ ] **Step 1: Write failing persistence tests**

```python
def test_same_catalog_version_is_idempotent(catalog_db, storage, v1) -> None:
    first = apply_catalog_package(catalog_db, storage, v1)
    second = apply_catalog_package(catalog_db, storage, v1)
    assert second.batch_id == first.batch_id
    assert counts(catalog_db) == first.persisted_counts


def test_v2_switches_current_assets_without_rewriting_v1(catalog_db, storage, v1, v2):
    apply_catalog_package(catalog_db, storage, v1)
    old = load_current_snapshot(catalog_db, "synthetic-cleanser-v1")
    apply_catalog_package(catalog_db, storage, v2)
    new = load_current_snapshot(catalog_db, "synthetic-cleanser-v1")
    assert new.image_id != old.image_id
    assert old.image_still_exists is True
    assert old.document_still_exists is True
```

Also test database failure after asset staging registers only unreferenced keys for cleanup and leaves no partially active products.

- [ ] **Step 2: Run tests and verify RED**

Run: `backend/.venv/Scripts/python.exe -m pytest backend/tests/test_catalog_import.py -q`

- [ ] **Step 3: Implement staged asset and transaction flow**

```python
def apply_catalog_package(
    db: Session,
    storage: StorageBackend,
    package: ValidatedCatalogPackage,
) -> ImportReport:
    existing = _find_import_batch(db, package.version, package.manifest_sha256)
    if existing:
        return _report_for_batch(existing)
    staged = stage_catalog_assets(storage, package)
    try:
        batch = _persist_catalog_transaction(db, package, staged)
    except Exception:
        db.rollback()
        register_cleanup_keys(db, [asset.key for asset in staged])
        raise
    return _report_for_batch(batch)
```

Use content-addressed catalog keys `product-images/catalog/{sha256[:2]}/{sha256}.{ext}` and equivalent document keys. Do not delete prior current assets during v2 import. Explicit `status=inactive` in a later package hides products from new search but preserves references.

- [ ] **Step 4: Verify PostgreSQL persistence and idempotency**

Run: `$env:RUN_INTEGRATION='1'; backend/.venv/Scripts/python.exe -m pytest backend/tests/integration/test_standard_product_catalog_http.py -q -k import`

Expected: v1 and repeated v1 are identical; v2 creates new versions; inactive products remain queryable by ID but not searchable; cleanup queue contains only staged unreferenced keys after forced failure.

- [ ] **Step 5: Run import tests and Ruff**

Run: `backend/.venv/Scripts/python.exe -m pytest backend/tests/test_catalog_import.py -q`

Run: `backend/.venv/Scripts/python.exe -m ruff check backend/app/services/catalog_import_service.py backend/scripts/import_standard_products.py backend/tests/test_catalog_import.py backend/tests/integration/test_standard_product_catalog_http.py`

- [ ] **Step 6: Save checkpoint**

If authorized, commit as `feat: import versioned product catalog`; otherwise run `git diff --check`.

---

### Task 6: Unified Product Search and Standard Product Detail API

**Files:**
- Create: `backend/app/schemas/product_catalog.py`
- Create: `backend/app/services/product_search_service.py`
- Create: `backend/app/api/product_catalog.py`
- Modify: `backend/app/main.py`
- Create: `backend/tests/test_product_search.py`
- Modify: `backend/tests/integration/test_standard_product_catalog_http.py`
- Modify: `backend/tests/test_app.py`

**Interfaces:**
- Consumes: normalized fields, aliases, `pg_trgm`, signed storage URLs.
- Produces: `ProductSearchItemOut`, `ProductSearchPageOut`, `StandardProductDetailOut`, `SearchCursor`, `search_product_options()`, `get_standard_product_detail()`; routes `GET /api/v1/product-search` and `GET /api/v1/catalog/products/{id}`.

- [ ] **Step 1: Write failing ranking, cursor and boundary tests**

```python
def test_search_orders_personal_exact_before_standard_alias_and_fuzzy(client, owner):
    response = client.get("/api/v1/product-search?q=合成洁面", headers=owner)
    assert response.status_code == 200
    items = response.json()["items"]
    assert [item["match_type"] for item in items[:3]] == [
        "personal_exact", "standard_exact", "standard_alias"
    ]


def test_standard_detail_returns_original_document_without_ai_fields(client, owner):
    detail = client.get("/api/v1/catalog/products/8", headers=owner).json()
    assert detail["current_document"]["indications_original_text"]
    assert "summary" not in detail["current_document"]
    assert "recommendation" not in detail
```

Add tests for English, punctuation/full-width normalization, pinyin alias, prefix, contains, trigram typo, stable cursor pagination, inactive exclusion, linked personal marker, custom personal result, account isolation and expired image URL regeneration.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `backend/.venv/Scripts/python.exe -m pytest backend/tests/test_product_search.py backend/tests/test_app.py -q`

- [ ] **Step 3: Define exact output contracts**

```python
class ProductSearchItemOut(BaseModel):
    source_type: Literal["personal", "standard"]
    match_type: Literal[
        "personal_exact", "standard_exact", "standard_alias",
        "prefix", "contains", "fuzzy"
    ]
    personal_product_id: int | None
    standard_product_id: int | None
    name: str
    brand_name: str | None
    formula_version: str | None
    product_category: str | None
    regulatory_type: Literal["cosmetic", "drug", "medical_device"] | None
    image_url: str | None
    image_expires_at: datetime | None
    in_cabinet: bool
```

The standard detail document returns only original text, source, region, language, version, effective date, registration number, checksum and signed original-document URL.

- [ ] **Step 4: Implement stable tiered search**

Use explicit integer match buckets before similarity. Search personal products only for the current user; search only active standard products. For standard results, left join the current user's personal product to populate `in_cabinet` and `personal_product_id`. Encode the last `(bucket, similarity, source_order, stable_id)` in an opaque URL-safe cursor and apply strict continuation predicates.

Do not include indications in the search vector, response summary or rank calculation.

- [ ] **Step 5: Register routes and verify OpenAPI**

```python
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
        db, user_id=current_user.id, query=q, limit=limit, cursor=cursor
    )

@catalog_router.get("/catalog/products/{standard_product_id}", response_model=StandardProductDetailOut)
def get_standard_product_endpoint(
    standard_product_id: int,
    current_user: User = Depends(get_current_app_user),
    db: Session = Depends(get_db),
) -> StandardProductDetailOut:
    return product_search_service.get_standard_product_detail(
        db, user_id=current_user.id, standard_product_id=standard_product_id
    )
```

Add the router before the `/{product_id}` personal product route cannot shadow it. Confirm both routes require Bearer auth.

- [ ] **Step 6: Run tests, integration and Ruff**

Run: `backend/.venv/Scripts/python.exe -m pytest backend/tests/test_product_search.py backend/tests/test_app.py -q`

Run: `$env:RUN_INTEGRATION='1'; backend/.venv/Scripts/python.exe -m pytest backend/tests/integration/test_standard_product_catalog_http.py -q -k search`

Run: `backend/.venv/Scripts/python.exe -m ruff check backend/app/schemas/product_catalog.py backend/app/services/product_search_service.py backend/app/api/product_catalog.py backend/app/main.py backend/tests/test_product_search.py`

- [ ] **Step 7: Save checkpoint**

If authorized, commit as `feat: search standard product catalog`; otherwise run `git diff --check`.

---

### Task 7: Add Standard Products to the Personal Cabinet

**Files:**
- Modify: `backend/app/schemas/product_catalog.py`
- Modify: `backend/app/services/product_service.py`
- Modify: `backend/app/api/products.py`
- Modify: `backend/tests/test_product_search.py`
- Modify: `backend/tests/integration/test_standard_product_catalog_http.py`

**Interfaces:**
- Consumes: `StandardProduct`, unique active `(user_id, standard_product_id)` constraint.
- Produces: `ProductFromStandardCreate(client_request_id, standard_product_id, display_name_override)`, `normalize_display_override()`, `add_standard_product_to_cabinet() -> tuple[PersonalProduct, bool]`, `POST /api/v1/products/from-standard`.

- [ ] **Step 1: Write failing add/deduplicate tests**

```python
def test_add_standard_product_is_idempotent_by_request_and_product(client, owner):
    first = client.post("/api/v1/products/from-standard", json=payload, headers=owner)
    retry = client.post("/api/v1/products/from-standard", json=payload, headers=owner)
    second_request = client.post(
        "/api/v1/products/from-standard",
        json={**payload, "client_request_id": str(uuid4())},
        headers=owner,
    )
    assert first.status_code == 201
    assert retry.status_code == 200
    assert second_request.status_code == 200
    assert len({first.json()["product_id"], retry.json()["product_id"], second_request.json()["product_id"]}) == 1
```

Also test inactive standard product returns 409, unknown returns 404, cross-account cabinets are independent, blank/long display override is rejected and an integrity race returns the winner.

- [ ] **Step 2: Run tests and verify RED**

Run: `backend/.venv/Scripts/python.exe -m pytest backend/tests/test_product_search.py -q -k cabinet`

- [ ] **Step 3: Implement atomic double-idempotency**

```python
def add_standard_product_to_cabinet(
    db: Session, *, user_id: int, client_request_id: UUID,
    standard_product_id: int, display_name_override: str | None,
) -> tuple[PersonalProduct, bool]:
    request_match = db.scalar(select(PersonalProduct).where(
        PersonalProduct.user_id == user_id,
        PersonalProduct.client_request_id == client_request_id,
    ))
    if request_match is not None:
        return request_match, False

    standard = db.get(StandardProduct, standard_product_id)
    if standard is None:
        raise HTTPException(status_code=404, detail="standard product not found")
    if standard.status != "active":
        raise HTTPException(status_code=409, detail="standard product is inactive")

    linked = db.scalar(select(PersonalProduct).where(
        PersonalProduct.user_id == user_id,
        PersonalProduct.standard_product_id == standard_product_id,
    ))
    if linked is not None:
        return linked, False

    product = PersonalProduct(
        user_id=user_id,
        client_request_id=client_request_id,
        name=standard.official_name,
        normalized_name=normalize_product_search_text(standard.official_name),
        standard_product_id=standard.id,
        display_name_override=normalize_display_override(display_name_override),
    )
    db.add(product)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        winner = db.scalar(select(PersonalProduct).where(
            PersonalProduct.user_id == user_id,
            PersonalProduct.standard_product_id == standard_product_id,
        ))
        if winner is None:
            raise
        return winner, False
    db.refresh(product)
    return product, True
```

Store the standard official name in legacy `name` for old clients, but resolve current API display as `display_name_override or standard_product.official_name`. Do not copy standard image bytes into user storage.

- [ ] **Step 4: Run focused and integration tests**

Run: `backend/.venv/Scripts/python.exe -m pytest backend/tests/test_product_search.py backend/tests/integration/test_standard_product_catalog_http.py -q -k cabinet`

Run: `backend/.venv/Scripts/python.exe -m ruff check backend/app/services/product_service.py backend/app/api/products.py backend/app/schemas/product_catalog.py`

- [ ] **Step 5: Save checkpoint**

If authorized, commit as `feat: add catalog products to cabinet`; otherwise run `git diff --check`.

---

### Task 8: Product Use Snapshot Semantics

**Files:**
- Modify: `backend/app/schemas/product.py`
- Modify: `backend/app/services/product_service.py`
- Modify: `backend/tests/test_product_models.py`
- Modify: `backend/tests/integration/test_product_http_closure.py`
- Modify: `backend/tests/integration/test_standard_product_catalog_http.py`

**Interfaces:**
- Consumes: current personal/standard product display, current image asset and current document.
- Produces: `ResolvedProductSnapshot`, `resolve_product_snapshot()`, snapshot-based `ProductUseProductOut`.

- [ ] **Step 1: Write failing immutable-history tests**

```python
def test_product_use_keeps_name_image_and_document_after_catalog_v2(client, owner):
    use = create_use_with_linked_standard_v1(client, owner)
    import_catalog_v2_with_new_name_image_document()
    restored = client.get(f"/api/v1/product-uses/{use['product_use_id']}", headers=owner).json()
    item = restored["products"][0]
    assert item["name"] == "合成产品旧名"
    assert item["formula_version"] == "v1"
    assert item["image_asset_id"] == use["products"][0]["image_asset_id"]
    assert item["document_version"] == "2026-01"
```

Also assert current personal product detail reflects v2 unless a display override exists; custom product use snapshots the custom name/image; legacy snapshot rows remain readable.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `backend/.venv/Scripts/python.exe -m pytest backend/tests/test_product_models.py backend/tests/integration/test_product_http_closure.py -q -k snapshot`

- [ ] **Step 3: Resolve and persist snapshots in the existing product-use transaction**

```python
@dataclass(frozen=True)
class ResolvedProductSnapshot:
    product_id: int
    name: str
    brand_name: str | None
    formula_version: str | None
    image_asset_id: int | None
    document_id: int | None


def resolve_product_snapshot(db: Session, product: PersonalProduct) -> ResolvedProductSnapshot:
    if product.standard_product_id is None:
        return ResolvedProductSnapshot(
            product_id=product.id,
            name=product.display_name_override or product.name,
            brand_name=None,
            formula_version=None,
            image_asset_id=product.user_image_asset_id,
            document_id=None,
        )
    standard = db.get(StandardProduct, product.standard_product_id)
    if standard is None:
        raise HTTPException(status_code=409, detail="linked standard product is unavailable")
    current_document_id = db.scalar(
        select(StandardProductDocument.id)
        .where(
            StandardProductDocument.standard_product_id == standard.id,
            StandardProductDocument.is_current.is_(True),
        )
        .order_by(StandardProductDocument.id.desc())
        .limit(1)
    )
    return ResolvedProductSnapshot(
        product_id=product.id,
        name=product.display_name_override or standard.official_name,
        brand_name=standard.brand_name,
        formula_version=standard.formula_version,
        image_asset_id=standard.primary_image_asset_id,
        document_id=current_document_id,
    )
```

Create `ProductUseProduct` rows from snapshots. Rewrite `_load_use_products()` to load association snapshots, not current `PersonalProduct.name`. Signed image URLs may be regenerated from the immutable snapshot asset ID, but the selected asset ID and document version must not change.

- [ ] **Step 4: Verify existing product-use behavior remains intact**

Run: `backend/.venv/Scripts/python.exe -m pytest backend/tests/test_product_models.py backend/tests/integration/test_product_http_closure.py backend/tests/integration/test_standard_product_catalog_http.py -q`

Expected: multi-select, zero-select “未注明产品”, idempotency, account isolation, product history and v1→v2 snapshot preservation all pass.

Run: `backend/.venv/Scripts/python.exe -m ruff check backend/app/schemas/product.py backend/app/services/product_service.py backend/tests/test_product_models.py`

- [ ] **Step 5: Save checkpoint**

If authorized, commit as `feat: snapshot product usage metadata`; otherwise run `git diff --check`.

---

### Task 9: Mobile Product Catalog API and Pure Search State

**Files:**
- Modify: `mobile/src/lib/product-api.ts`
- Create: `mobile/src/lib/product-search-flow.ts`
- Create: `mobile/src/lib/product-image-picker.ts`
- Modify: `mobile/tests/product-api.test.mjs`
- Create: `mobile/tests/product-search-flow.test.mjs`
- Create: `mobile/tests/product-image-picker.test.mjs`

**Interfaces:**
- Consumes: authenticated request wrapper and backend Task 6–8 contracts.
- Produces: `ProductSearchItem`, `ProductSearchPage`, `StandardProductDetail`, `searchProducts()`, `getStandardProduct()`, `addStandardProductToCabinet()`, `buildCustomProductForm()`, `createCustomProduct()`, `createProductSearchGuard()`.

- [ ] **Step 1: Write failing API contract tests**

```javascript
test('unified search encodes query and cursor exactly', async () => {
  const client = recorder({ items: [], next_cursor: null });
  await searchProducts(client.request, { query: '烟酰胺 10%', limit: 20, cursor: 'next' });
  assert.equal(
    client.calls[0].path,
    '/product-search?q=%E7%83%9F%E9%85%B0%E8%83%BA+10%25&limit=20&cursor=next',
  );
});

test('custom product form carries optional native image', () => {
  const form = recordForm();
  buildCustomProductForm({ clientRequestId: UUID, name: '自建产品', image: FILE }, form);
  assert.deepEqual(form.entries.map(([key]) => key), ['client_request_id', 'name', 'file']);
});
```

Test `from-standard` JSON, standard detail path, expanded snapshot fields, absent custom image and preservation of the existing product-use payload.

- [ ] **Step 2: Write failing stale-response and selection tests**

```javascript
test('late search results cannot overwrite a newer query', () => {
  const guard = createProductSearchGuard();
  const oldGeneration = guard.begin('洁面');
  const newGeneration = guard.begin('面霜');
  assert.equal(guard.accept(oldGeneration, '洁面'), false);
  assert.equal(guard.accept(newGeneration, '面霜'), true);
});
```

Also test that an `in_cabinet` standard result resolves to its existing personal ID, a newly added standard result is selected once, and custom product IDs do not duplicate the multiselect.

- [ ] **Step 3: Run unit tests and verify RED**

Run: `cd mobile; npm run test:unit -- product-api product-search-flow product-image-picker`

Expected: missing exports/modules.

- [ ] **Step 4: Implement exact TypeScript types and pure helpers**

```typescript
export type ProductSearchItem = {
  source_type: 'personal' | 'standard';
  match_type: ProductMatchType;
  personal_product_id: number | null;
  standard_product_id: number | null;
  name: string;
  brand_name: string | null;
  formula_version: string | null;
  product_category: string | null;
  regulatory_type: 'cosmetic' | 'drug' | 'medical_device' | null;
  image_url: string | null;
  image_expires_at: string | null;
  in_cabinet: boolean;
};
```

`product-image-picker.ts` must convert Expo assets to `{ uri, name, type }` without reading bytes into JavaScript. It does not request permissions at module import time.

- [ ] **Step 5: Run mobile unit, type and lint checks**

Run: `cd mobile; npm run test:unit`

Run: `cd mobile; npm run typecheck`

Run: `cd mobile; npm run lint`

- [ ] **Step 6: Save checkpoint**

If authorized, commit as `feat: add mobile product catalog contracts`; otherwise run `git diff --check`.

---

### Task 10: Reusable Mobile Search, Image, and Custom Product Components

**Files:**
- Create: `mobile/src/components/product-image.tsx`
- Create: `mobile/src/components/product-search-result-row.tsx`
- Create: `mobile/src/components/product-search-picker.tsx`
- Create: `mobile/src/components/custom-product-form.tsx`
- Modify: `mobile/app.json`
- Create: `mobile/tests/product-ui-contract.test.mjs`

**Interfaces:**
- Consumes: Task 9 API and flow helpers, existing `AppButton`, `InlineNotice`, theme tokens and authenticated request.
- Produces: `ProductSearchPicker({ selectedProductIds, onProductReady })`, `CustomProductForm({ initialName, onCreated })`, `ProductImage({ uri, category, accessibilityLabel })`.

- [ ] **Step 1: Read exact Expo 57 image-picker documentation**

Verify `launchImageLibraryAsync`, `launchCameraAsync`, permission config and result types at `https://docs.expo.dev/versions/v57.0.0/sdk/imagepicker/`. Record only the chosen APIs in the implementation notes; do not upgrade packages.

- [ ] **Step 2: Write failing pure/static component contract tests**

```javascript
test('product picker exposes required accessibility and boundary copy', () => {
  const source = readFile('src/components/product-search-picker.tsx');
  assert.match(source, /accessibilityLabel="搜索或添加产品"/);
  assert.match(source, /搜索结果仅用于记录，不代表推荐/);
});

test('custom form keeps image optional and has retry/remove controls', () => {
  const source = readFile('src/components/custom-product-form.tsx');
  assert.match(source, /拍摄产品图片/);
  assert.match(source, /从相册选择/);
  assert.match(source, /移除图片/);
});
```

Keep behavioral state in pure helpers covered in Task 9; do not add a new React test dependency for this slice.

- [ ] **Step 3: Run tests and verify RED**

Run: `cd mobile; npm run test:unit -- product-ui-contract`

- [ ] **Step 4: Implement reusable components**

`ProductSearchPicker` must debounce 250ms, cancel timers on unmount, ignore stale generations, retain personal-cabinet choices during search failure and expose custom creation. It must render source groups and never display indications in result rows.

`ProductSearchResultRow` shows image, brand, official name, formula version and regulatory type; buttons are exactly `选中`, `已在产品柜`, or `加入产品柜并选中` based on source and state.

`CustomProductForm` preserves the UUID, name and local image URI across network failures. Image upload failure offers retry or removal; removing the optional image permits name-only creation.

- [ ] **Step 5: Configure permissions with neutral copy**

Add the Expo image-picker plugin configuration for product images without changing the existing skin-observation camera copy. Use separate text such as “允许 Skin Care Agent 选择产品图片” and “允许 Skin Care Agent 拍摄产品图片”; keep microphone disabled.

- [ ] **Step 6: Run full mobile validation**

Run: `cd mobile; npm run test:unit`

Run: `cd mobile; npm run typecheck`

Run: `cd mobile; npm run lint`

- [ ] **Step 7: Save checkpoint**

If authorized, commit as `feat: add product search picker`; otherwise run `git diff --check`.

---

### Task 11: Product Page, Standard Detail, and Product-Use Integration

**Files:**
- Modify: `mobile/src/app/(tabs)/products.tsx`
- Modify: `mobile/src/app/product-use/new.tsx`
- Modify: `mobile/src/app/product/[productId].tsx`
- Create: `mobile/src/app/product-catalog/[standardProductId].tsx`
- Modify: `mobile/src/components/product-use-card.tsx`
- Modify: `mobile/tests/product-use-flow.test.mjs`
- Modify: `mobile/tests/product-ui-contract.test.mjs`

**Interfaces:**
- Consumes: `ProductSearchPicker`, `CustomProductForm`, expanded product/use API types.
- Produces: complete products-tab and use-recording flows; standard detail route with original-document boundary copy.

- [ ] **Step 1: Write failing page-contract and selection tests**

```javascript
test('standard detail shows source and prohibits recommendation language', () => {
  const source = readFile('src/app/product-catalog/[standardProductId].tsx');
  assert.match(source, /【适应症】原文/);
  assert.match(source, /官方来源/);
  assert.match(source, /不构成诊断或使用建议/);
  assert.doesNotMatch(source, /推荐使用|适合你的皮肤/);
});

test('newly added product is selected once', () => {
  assert.deepEqual(selectReadyProduct([2, 4], { product_id: 6 }), [2, 4, 6]);
  assert.deepEqual(selectReadyProduct([2, 4, 6], { product_id: 6 }), [2, 4, 6]);
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `cd mobile; npm run test:unit -- product-use-flow product-ui-contract`

- [ ] **Step 3: Integrate the Products tab**

Replace the always-visible plain-name add panel with the reusable search picker. Keep the personal cabinet list and product history navigation. Standard search rows navigate to `/product-catalog/{id}` for details and offer explicit add; custom creation remains available for no-match and user choice.

- [ ] **Step 4: Integrate product-use multiselect**

Keep existing selected chips, date/time, note and “未注明产品” behavior. Add the search picker below selected personal products. `onProductReady` inserts the returned personal product ID using deterministic sorted de-duplication and reloads the cabinet without resetting the fixed product-use UUID or other draft fields.

- [ ] **Step 5: Render current and historical product metadata correctly**

Personal product detail shows current image and current standard metadata. `ProductUseCard` renders the snapshot name/image/version from each use response, never by re-querying current standard data. Standard detail shows current official image and source-versioned original indications only; drug/device pages show “请以当前官方说明书及专业人员指导为准”.

- [ ] **Step 6: Run complete mobile checks**

Run: `cd mobile; npm run test:unit`

Run: `cd mobile; npm run typecheck`

Run: `cd mobile; npm run lint`

- [ ] **Step 7: Save checkpoint**

If authorized, commit as `feat: integrate product catalog flows`; otherwise run `git diff --check`.

---

### Task 12: Full Regression, Real Local Closure, Android Acceptance, and Documentation

**Files:**
- Create: `backend/scripts/verify_standard_product_catalog_flow.py`
- Modify: `backend/tests/integration/test_standard_product_catalog_http.py`
- Modify: `backend/README.md`
- Modify: `docs/environment_setup.md`
- Modify: `docs/current_status.md`

**Interfaces:**
- Consumes: every prior task.
- Produces: reproducible PostgreSQL/HTTP closure, migration evidence, Android acceptance checklist and current project status.

- [ ] **Step 1: Implement the deterministic local closure script**

The script must use a disposable PostgreSQL schema and local object-storage directory, then:

```python
def verify_flow() -> None:
    migrate_to_head()
    import_fixture_v1()
    owner = register_and_accept_consents("owner")
    other = register_and_accept_consents("other")
    assert_search_order(owner)
    linked = add_standard_and_retry(owner)
    custom = create_custom_with_image_and_retry(owner)
    use = create_multi_product_use(owner, [linked.id, custom.id])
    import_fixture_v2()
    assert_current_catalog_is_v2(owner)
    assert_use_snapshot_is_v1(owner, use.id)
    assert_inactive_product_not_searchable(owner)
    assert_account_isolation(other, linked.id, custom.id, use.id)
```

Always delete temporary users, schema and storage in `finally`. The script must not call any external API or use real product/medical data.

- [ ] **Step 2: Run backend full regression and static checks**

Run: `backend/.venv/Scripts/python.exe -m pytest backend/tests -q`

Expected: all default tests pass; only explicitly gated integration/live GLM tests skip.

Run: `backend/.venv/Scripts/python.exe -m ruff check backend/app backend/tests backend/scripts`

- [ ] **Step 3: Run forced PostgreSQL integration and migration round trip**

Run: `$env:RUN_INTEGRATION='1'; backend/.venv/Scripts/python.exe -m pytest backend/tests/integration/test_standard_product_migration_roundtrip.py backend/tests/integration/test_standard_product_catalog_http.py backend/tests/integration/test_product_http_closure.py -q`

Expected: migrations `0017 → head → 0017 → head` preserve old products/uses; import, search, images, documents, cabinet, snapshots and account isolation pass.

- [ ] **Step 4: Run the real local HTTP closure**

Run: `backend/.venv/Scripts/python.exe backend/scripts/verify_standard_product_catalog_flow.py`

Expected: prints only stage names and PASS counts; no credentials, full source documents or signed URLs.

- [ ] **Step 5: Run mobile regression**

Run: `cd mobile; npm run test:unit`

Run: `cd mobile; npm run typecheck`

Run: `cd mobile; npm run lint`

- [ ] **Step 6: Run Android emulator acceptance against local `8080`**

Use the existing Pixel 8 AVD and Expo Go with `adb reverse tcp:8080 tcp:8080` and `adb reverse tcp:8081 tcp:8081`. Verify manually:

1. search exact Chinese, English alias, pinyin alias and one typo;
2. add a standard product, repeat it, and see only one cabinet row;
3. open current image and original-document detail with source/version;
4. create a name-only custom product and an image custom product;
5. select standard and custom products together in one use record;
6. leave, force-stop Expo Go, reopen and recover cabinet/use history;
7. after importing synthetic v2, current product shows v2 while the old use card still shows v1 snapshot;
8. disable network or stop backend and confirm existing cabinet/custom creation entry and “未注明产品” degradation copy remain understandable.

Do not use synthetic test indications as real medical information in screenshots or release data.

- [ ] **Step 7: Update documentation with evidence, not claims**

Update `backend/README.md` and `docs/environment_setup.md` with the import command, package format, `pg_trgm`, image storage and synthetic-fixture warning. Update `docs/current_status.md` only after actual evidence exists: migration head, test counts, HTTP closure, Android results, remaining production catalog/content licensing gate and whether Slice 4A is complete.

- [ ] **Step 8: Final diff and acceptance audit**

Run: `git diff --check`

Run: `git status --short`

Re-read `design/product/skin_care_app_mvp_spec.md`, the approved spec and this plan. Confirm every Slice 4A acceptance line has direct test or device evidence. Do not mark complete if production-like import cannot be validated, account isolation fails, history changes after v2, or any page implies recommendation/diagnosis.

- [ ] **Step 9: Save final checkpoint**

If authorized:

```bash
git add skin_care_agent/backend skin_care_agent/mobile skin_care_agent/design/product/skin_care_app_mvp_spec.md skin_care_agent/docs skin_care_agent/project_background.md
git commit -m "feat: complete standard product catalog slice"
```

Otherwise leave the verified working tree intact and report the exact diff plus all validation commands/results to the user.

---

## Slice 4A Exit Gate

Do not proceed to another product or trend slice until all conditions hold:

- catalog `v1` import, identical retry, `v2` update, inactive behavior and staged-failure cleanup are proven against PostgreSQL and local object storage;
- personal exact, standard exact, alias, prefix, contains and fuzzy ranking are stable, paginated and account-isolated;
- standard add is idempotent by both request UUID and `(user, standard product)` uniqueness;
- standard and custom images survive API/client restart, and user images cannot cross accounts;
- standard updates change current cabinet/detail but never historical use snapshots;
- official source/version/original indications are traceable and never enter AI, recommendation, trends or efficacy claims;
- existing Slice 4 JSON product creation, multi-product use and “未注明产品” remain compatible;
- backend full tests/Ruff, forced PostgreSQL integration, mobile tests/typecheck/lint, real local HTTP closure and Android acceptance all pass;
- `docs/current_status.md` records actual counts and remaining real-catalog rights/source gate.
