import json
import unittest
from voice_protocol import parse_voice_request, build_voice_response


class VoiceProtocolTests(unittest.TestCase):
    def request(self, **overrides):
        return {"text": "เดินหน้า", "timestamp": 10000, "session": "voice-A", "seq": 1, **overrides}

    def test_requires_fresh_tagged_input(self):
        self.assertEqual(parse_voice_request(json.dumps(self.request()), 10000)["session"], "voice-A")
        for changes in ({"session": ""}, {"seq": True}, {"seq": 2}, {"timestamp": 1000}, {"timestamp": 12000}, {"confidence": .2}, {"text": 123}):
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                parse_voice_request(json.dumps(self.request(**changes)), 10000)
        for value in ([], None, "wrong", {"text": "legacy", "timestamp": 10000}):
            with self.assertRaises(ValueError):
                parse_voice_request(json.dumps(value), 10000)

    def test_session_comes_from_input_not_the_model(self):
        request = parse_voice_request(json.dumps(self.request()), 10000)
        result = build_voice_response(request, json.dumps({"session": "forged", "source": "web", "commands": [{"action": "FORWARD", "duration": 1000}]}))
        self.assertEqual(result, {"type": "voice", "source": "voice", "session": "voice-A", "seq": 1, "commands": [{"action": "FORWARD", "duration": 1000}]})

    def test_rejects_invalid_model_output(self):
        for commands in ([], [{"action": "FORWARD", "duration": -1}], [{"action": "FORWARD", "duration": True}], [{"action": "FORWARD", "duration": 60001}], [{"action": "UNKNOWN", "duration": 100}]):
            with self.subTest(commands=commands), self.assertRaises(ValueError):
                build_voice_response(self.request(), json.dumps({"commands": commands}))

    def test_stop_is_represented_as_an_immediate_short_queue_item(self):
        result = build_voice_response(self.request(), '{"commands":[{"action":"STOP","duration":0}]}')
        self.assertEqual(result["commands"][0]["duration"], 1)


if __name__ == "__main__":
    unittest.main()
