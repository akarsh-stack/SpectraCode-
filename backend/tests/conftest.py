"""Shared pytest fixtures and fakes.

The agents talk to Claude through ``agents.base.get_llm()`` which returns a
``ChatAnthropic`` and then calls ``.with_structured_output(Schema).ainvoke(...)``.
``FakeLLM`` mimics that surface and returns a canned result so tests never make
a real network call.
"""

from __future__ import annotations

import pytest


class _FakeStructured:
    def __init__(self, result):
        self._result = result

    async def ainvoke(self, _messages):
        return self._result


class FakeLLM:
    """Drop-in replacement for the object returned by ``get_llm()``."""

    def __init__(self, result):
        self._result = result

    def with_structured_output(self, _schema):
        return _FakeStructured(self._result)


@pytest.fixture
def fake_llm():
    """Return the FakeLLM class so tests can build canned responses."""
    return FakeLLM
