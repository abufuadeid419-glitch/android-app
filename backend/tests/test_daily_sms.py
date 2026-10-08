"""Daily SMS backend endpoint tests (Convex HTTP).

Covers:
- GET /api/org/daily-sms: owner receives summary with Arabic keywords; agent/acct are forbidden.
- PUT /api/org/daily-sms: toggle enabled off then back on (restored to true at teardown).
- POST /api/org/daily-sms/test: owner path; sends real SMS via gateway so this runs AT MOST ONCE
  per test session and expects a 4xx/5xx with an Arabic error (SIM missing / send failure).
"""

import os
import pytest
import requests

CONVEX_SITE = "https://fearless-ostrich-878.eu-west-1.convex.site"
BASE = f"{CONVEX_SITE}/api"

OWNER = "test_token_owner"
AGENT = "test_token_agent"
ACCT = "test_token_acct"


def _h(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def api_client():
    s = requests.Session()
    yield s
    # Teardown: make absolutely sure daily_sms is back ON for the test org.
    try:
        s.put(f"{BASE}/org/daily-sms", headers=_h(OWNER), json={"enabled": True}, timeout=20)
    except Exception:
        pass


# --- GET /api/org/daily-sms --------------------------------------------------
class TestDailySmsGet:
    def test_owner_gets_arabic_summary(self, api_client):
        r = api_client.get(f"{BASE}/org/daily-sms", headers=_h(OWNER), timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "enabled" in data and isinstance(data["enabled"], bool)
        assert "phone" in data
        assert "text" in data and isinstance(data["text"], str)
        assert data.get("send_hour_local") == 21
        txt = data["text"]
        # Arabic summary must mention sales/collections/new-debts labels.
        assert "المبيعات" in txt, txt
        assert "التحصيلات" in txt, txt
        assert "ديون جديدة" in txt, txt

    def test_agent_forbidden(self, api_client):
        r = api_client.get(f"{BASE}/org/daily-sms", headers=_h(AGENT), timeout=20)
        assert r.status_code in (401, 403), r.text
        body = r.json() if r.content else {}
        detail = body.get("detail") or body.get("message") or ""
        assert "ليس لديك صلاحية" in detail or "صلاحية" in detail, detail

    def test_accountant_forbidden(self, api_client):
        r = api_client.get(f"{BASE}/org/daily-sms", headers=_h(ACCT), timeout=20)
        assert r.status_code in (401, 403), r.text
        detail = (r.json() or {}).get("detail", "") if r.content else ""
        assert "صلاحية" in detail, detail


# --- PUT /api/org/daily-sms --------------------------------------------------
class TestDailySmsToggle:
    def test_toggle_off_then_on_persists(self, api_client):
        # Turn OFF
        r1 = api_client.put(f"{BASE}/org/daily-sms", headers=_h(OWNER), json={"enabled": False}, timeout=20)
        assert r1.status_code == 200, r1.text
        assert r1.json().get("enabled") is False

        # Verify GET reflects persisted value
        r2 = api_client.get(f"{BASE}/org/daily-sms", headers=_h(OWNER), timeout=20)
        assert r2.status_code == 200, r2.text
        assert r2.json().get("enabled") is False

        # Restore ON
        r3 = api_client.put(f"{BASE}/org/daily-sms", headers=_h(OWNER), json={"enabled": True}, timeout=20)
        assert r3.status_code == 200, r3.text
        assert r3.json().get("enabled") is True

        # Verify persisted
        r4 = api_client.get(f"{BASE}/org/daily-sms", headers=_h(OWNER), timeout=20)
        assert r4.status_code == 200, r4.text
        assert r4.json().get("enabled") is True


# --- POST /api/org/daily-sms/test -------------------------------------------
# Runs once per session. Owner phone (+963900000002) is a fake test number, and
# the SMS gateway Android device has "No SIMs found", so expect an Arabic error.
@pytest.mark.skipif(os.environ.get("SKIP_DAILY_SMS_SEND") == "1", reason="Skipped by SKIP_DAILY_SMS_SEND=1")
class TestDailySmsSendTest:
    def test_owner_test_send_returns_arabic_error(self, api_client):
        r = api_client.post(f"{BASE}/org/daily-sms/test", headers=_h(OWNER), json={}, timeout=40)
        # Gateway failure is expected because the device has no SIM.
        if r.status_code == 200:
            # If gateway somehow succeeded, just assert payload structure.
            assert r.json().get("ok") is True
            return
        assert r.status_code in (400, 500, 502), r.text
        detail = (r.json() or {}).get("detail", "")
        assert any("\u0600" <= ch <= "\u06FF" for ch in detail), f"Expected Arabic error, got: {detail!r}"
