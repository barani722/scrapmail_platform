"""Minimal Supabase REST client for workers (secret key, server-side only)."""

from __future__ import annotations

from typing import Any

import httpx

from .config import Settings


class SupabaseError(RuntimeError):
    pass


class Db:
    def __init__(self, settings: Settings) -> None:
        self._client = httpx.Client(
            base_url=f"{settings.supabase_url}/rest/v1",
            headers={
                "apikey": settings.supabase_secret_key,
                "Authorization": f"Bearer {settings.supabase_secret_key}",
                "Content-Type": "application/json",
            },
            timeout=60,
        )

    def close(self) -> None:
        self._client.close()

    def _check(self, response: httpx.Response) -> Any:
        if response.status_code >= 400:
            raise SupabaseError(f"{response.status_code}: {response.text[:500]}")
        return response.json() if response.content else None

    def select(self, table: str, params: dict[str, str]) -> list[dict[str, Any]]:
        return self._check(self._client.get(f"/{table}", params=params))

    def insert(
        self,
        table: str,
        rows: list[dict[str, Any]] | dict[str, Any],
        *,
        on_conflict: str | None = None,
        ignore_duplicates: bool = False,
        returning: str | None = None,
    ) -> list[dict[str, Any]]:
        prefer = []
        if on_conflict:
            prefer.append(
                "resolution=ignore-duplicates"
                if ignore_duplicates
                else "resolution=merge-duplicates"
            )
        prefer.append("return=representation" if returning else "return=minimal")
        params = {}
        if on_conflict:
            params["on_conflict"] = on_conflict
        if returning:
            params["select"] = returning
        result = self._check(
            self._client.post(
                f"/{table}", json=rows, params=params, headers={"Prefer": ",".join(prefer)}
            )
        )
        return result or []

    def update(self, table: str, filters: dict[str, str], values: dict[str, Any]) -> None:
        self._check(
            self._client.patch(
                f"/{table}", params=filters, json=values, headers={"Prefer": "return=minimal"}
            )
        )

    def rpc(self, function: str, args: dict[str, Any]) -> Any:
        return self._check(self._client.post(f"/rpc/{function}", json=args))
