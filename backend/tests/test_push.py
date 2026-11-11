import json

import httpx

from app import push
from app.push import PushMessage, is_expo_token, send_expo_push


def test_token_format():
    assert is_expo_token("ExponentPushToken[xxxx]")
    assert not is_expo_token("fcm:abc")


def test_send_batches_and_maps_errors(monkeypatch):
    calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        calls.append(body)
        tickets = []
        for m in body:
            if m["to"].endswith("[dead]"):
                tickets.append({"status": "error", "message": "gone", "details": {"error": "DeviceNotRegistered"}})
            else:
                tickets.append({"status": "ok", "id": "t"})
        return httpx.Response(200, json={"data": tickets})

    real_client = httpx.Client
    monkeypatch.setattr(push.httpx, "Client", lambda **kw: real_client(transport=httpx.MockTransport(handler), **kw))

    msgs = [PushMessage(f"ExponentPushToken[{i}]", "t", "b") for i in range(150)]
    msgs.append(PushMessage("ExponentPushToken[dead]", "t", "b"))
    results = send_expo_push(msgs)

    assert [len(c) for c in calls] == [100, 51]  # Expo's 100-per-request limit
    assert calls[0][0]["channelId"] == "reminders" and calls[0][0]["sound"] == "default"
    assert sum(r.ok for r in results) == 150
    assert results[-1].error == "DeviceNotRegistered"


def test_transport_failure_marks_batch_failed(monkeypatch):
    def handler(request):
        raise httpx.ConnectError("down")

    real_client = httpx.Client
    monkeypatch.setattr(push.httpx, "Client", lambda **kw: real_client(transport=httpx.MockTransport(handler), **kw))
    results = send_expo_push([PushMessage("ExponentPushToken[a]", "t", "b")])
    assert not results[0].ok and results[0].error.startswith("transport")
