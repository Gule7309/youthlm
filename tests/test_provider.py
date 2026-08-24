import unittest

from pydantic import ValidationError

from app.provider import FakeModelProvider, ModelRequest, ModelTurn


class FakeModelProviderTests(unittest.TestCase):
    def test_returns_scripted_turn_and_records_request(self) -> None:
        expected = ModelTurn(stop_reason="end_turn", text="YouthLM is ready.")
        provider = FakeModelProvider([expected])
        request = ModelRequest(messages=[{"role": "user", "content": "Hello"}])

        actual = provider.converse(request)

        self.assertEqual(actual, expected)
        self.assertEqual(provider.requests, [request])

    def test_fails_explicitly_when_script_is_exhausted(self) -> None:
        provider = FakeModelProvider([])
        request = ModelRequest(messages=[{"role": "user", "content": "Hello"}])

        with self.assertRaisesRegex(RuntimeError, "no scripted turns remaining"):
            provider.converse(request)

    def test_model_turn_rejects_unknown_fields(self) -> None:
        with self.assertRaises(ValidationError):
            ModelTurn(stop_reason="end_turn", text="ok", invented_field="not allowed")


if __name__ == "__main__":
    unittest.main()
