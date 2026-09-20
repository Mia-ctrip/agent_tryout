from app.assemblers import PreparedImage, assemble


def image(client_id, date=None, label="image"):
    return PreparedImage(client_id, date, label, "image/jpeg", f"data:image/jpeg;base64,{client_id}", f"data/images/{client_id}.jpg")


def content(messages):
    return messages[1]["content"]


def test_single_keeps_region_prompt_then_image():
    parts = content(assemble({"scenario": "single", "region": "chin", "userPrompt": "observe", "systemPrompt": "system"}, [image("one")]))
    assert parts[0]["text"].startswith("observe")
    assert "Region under review: chin" in parts[0]["text"]
    assert parts[-1]["image_url"]["url"].endswith("one")


def test_pair_is_explicitly_earlier_then_later():
    parts = content(assemble({"scenario": "pair", "region": "nose", "userPrompt": "compare", "systemPrompt": "system"}, [image("later", "2026-09-18", "Later"), image("earlier", "2026-09-01", "Earlier")]))
    text = parts[0]["text"]
    assert "role=Earlier; date=2026-09-01" in text
    assert "role=Later; date=2026-09-18" in text
    assert parts[2]["image_url"]["url"].endswith("earlier")


def test_timeline_sorts_date_and_keeps_image_attached():
    parts = content(assemble({"scenario": "timeline", "region": "full_face", "userPrompt": "trend", "systemPrompt": "system"}, [image("late", "2026-09-18"), image("early", "2026-08-20")]))
    assert "timepoint_1: date=2026-08-20" in parts[0]["text"]
    assert parts[2]["image_url"]["url"].endswith("early")
    assert parts[4]["image_url"]["url"].endswith("late")


def test_assembly_never_contains_provider_secret():
    messages = assemble({"scenario": "single", "region": "chin", "userPrompt": "x", "systemPrompt": "y"}, [image("one")])
    assert "GLM_API_KEY" not in str(messages)
