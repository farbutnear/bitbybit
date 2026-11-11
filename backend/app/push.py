"""Sending push notifications through Expo's push service.

Expo's service fans out to APNs (iOS) and FCM (Android), so the backend only deals with
one API and one token format: ExponentPushToken[...].
"""

from collections.abc import Callable, Sequence
from dataclasses import dataclass

import httpx

from .config import settings

EXPO_BATCH_LIMIT = 100  # Expo accepts up to 100 messages per request


@dataclass
class PushMessage:
    to: str
    title: str
    body: str
    data: dict | None = None


@dataclass
class PushResult:
    token: str
    ok: bool
    error: str | None = None  # e.g. "DeviceNotRegistered" -> delete the token


# Type of a sender, so tests and the debug route can swap in a fake.
Sender = Callable[[Sequence[PushMessage]], list[PushResult]]


def is_expo_token(token: str) -> bool:
    return token.startswith(("ExponentPushToken[", "ExpoPushToken[")) and token.endswith("]")


def send_expo_push(messages: Sequence[PushMessage]) -> list[PushResult]:
    headers = {"Accept": "application/json", "Content-Type": "application/json"}
    if settings.expo_access_token:
        headers["Authorization"] = f"Bearer {settings.expo_access_token}"

    results: list[PushResult] = []
    with httpx.Client(timeout=10) as client:
        for i in range(0, len(messages), EXPO_BATCH_LIMIT):
            batch = messages[i : i + EXPO_BATCH_LIMIT]
            payload = [
                {"to": m.to, "title": m.title, "body": m.body, "data": m.data or {}, "sound": "default",
                 "channelId": "reminders"}
                for m in batch
            ]
            try:
                resp = client.post(settings.expo_push_url, json=payload, headers=headers)
                resp.raise_for_status()
                tickets = resp.json().get("data", [])
            except httpx.HTTPError as exc:
                results.extend(PushResult(m.to, False, f"transport: {exc}") for m in batch)
                continue
            for m, ticket in zip(batch, tickets, strict=False):
                if ticket.get("status") == "ok":
                    results.append(PushResult(m.to, True))
                else:
                    err = (ticket.get("details") or {}).get("error") or ticket.get("message")
                    results.append(PushResult(m.to, False, err))
    # Note: a production setup should also poll Expo's receipts endpoint ~15 min later,
    # because some delivery errors (e.g. bad credentials) only show up there.
    return results
