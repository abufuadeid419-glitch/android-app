"""Backend API tests against the live Convex HTTP edge for Smart System.

Covers:
- Public API root is reachable (GET /api/).
- /api/auth/otp/request validates phone format and returns Arabic error.
- /api/auth/me works with each seeded test token and returns correct role.
- Rate-limit / SIM-missing path for OTP (gated behind env flag to avoid spam).
"""

import os
import pytest
import requests

CONVEX_SITE = "https://fearless-ostrich-878.eu-west-1.convex.site"
BASE = f"{CONVEX_SITE}/api"

SEED_TOKENS = {
    "DEVELOPER": "test_token_dev",
    "OWNER": "test_token_owner",
    "ACCOUNTANT": "test_token_acct",
    "FIELD_AGENT": "test_token_agent",
}


@pytest.fixture(scope="module")
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# --- API root reachability ----------------------------------------------------
class TestApiRoot:
    def test_api_root_reachable(self, api_client):
        r = api_client.get(f"{BASE}/", timeout=20)
        assert r.status_code == 200, r.text


# --- OTP request validation ---------------------------------------------------
class TestOtpRequestValidation:
    def test_invalid_phone_returns_arabic_400(self, api_client):
        r = api_client.post(f"{BASE}/auth/otp/request", json={"phone": "notaphone"}, timeout=20)
        assert r.status_code in (400, 422), r.text
        body = r.json()
        detail = body.get("detail") or body.get("message") or ""
        # Expect Arabic validation message
        assert any(ch >= "\u0600" and ch <= "\u06FF" for ch in detail), f"Expected Arabic message, got: {detail!r}"

    def test_empty_phone_returns_error(self, api_client):
        r = api_client.post(f"{BASE}/auth/otp/request", json={"phone": ""}, timeout=20)
        assert r.status_code in (400, 422), r.text


# --- /api/auth/me with seeded tokens -----------------------------------------
class TestAuthMe:
    @pytest.mark.parametrize("role,token", list(SEED_TOKENS.items()))
    def test_me_with_seed_token(self, api_client, role, token):
        r = api_client.get(f"{BASE}/auth/me", headers={"Authorization": f"Bearer {token}"}, timeout=20)
        assert r.status_code == 200, f"[{role}] HTTP {r.status_code}: {r.text}"
        data = r.json()
        assert "user_id" in data, data
        assert data.get("phone", "").startswith("+9639000000"), data
        if role == "DEVELOPER":
            assert data.get("role") == "DEVELOPER"
            assert data.get("org_id") in (None, "")
        elif role == "OWNER":
            assert data.get("role") == "OWNER"
            assert data.get("org_id") == "org_test_1"
            assert data.get("org") and data["org"].get("id") == "org_test_1"
        elif role == "ACCOUNTANT":
            assert data.get("role") == "EMPLOYEE"
            assert data.get("employee_type") == "ACCOUNTANT"
            assert data.get("org_id") == "org_test_1"
        elif role == "FIELD_AGENT":
            assert data.get("role") == "EMPLOYEE"
            assert data.get("employee_type") == "FIELD_AGENT"
            assert data.get("org_id") == "org_test_1"

    def test_me_without_token_returns_401(self, api_client):
        r = api_client.get(f"{BASE}/auth/me", timeout=20)
        assert r.status_code == 401, r.text

    def test_me_with_invalid_token_returns_401(self, api_client):
        r = api_client.get(f"{BASE}/auth/me", headers={"Authorization": "Bearer not_a_real_token_xyz"}, timeout=20)
        assert r.status_code == 401, r.text


# --- OTP send error path (SIM missing).  Runs once per hour at most. ---------
# Guarded so the test suite doesn't spam real numbers.
@pytest.mark.skipif(os.environ.get("RUN_OTP_SMS_TEST") != "1", reason="Gated by RUN_OTP_SMS_TEST=1 (rate-limited to 5/hour)")
class TestOtpSmsSimMissing:
    def test_valid_phone_returns_sim_missing_arabic_error(self, api_client):
        r = api_client.post(
            f"{BASE}/auth/otp/request",
            json={"phone": "+963900000099"},
            timeout=30,
        )
        assert r.status_code in (400, 500, 502), r.text
        detail = (r.json().get("detail") or "")
        # Any Arabic error is acceptable (SIM missing, invalid number, gateway down, etc.)
        assert any("\u0600" <= ch <= "\u06FF" for ch in detail), f"Expected Arabic error, got: {detail!r}"
