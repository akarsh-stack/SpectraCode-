import os

from dotenv import dotenv_values, load_dotenv

# Let the project's .env win over any pre-existing OS environment variables
# (e.g. a globally-set ANTHROPIC_API_KEY / ANTHROPIC_BASE_URL from other tools).
load_dotenv(override=True)

# If .env doesn't explicitly set a custom Anthropic base URL, drop any inherited
# one so the SDK talks to the real api.anthropic.com instead of a stray proxy.
_dotenv = dotenv_values()
if "ANTHROPIC_BASE_URL" not in _dotenv:
    os.environ.pop("ANTHROPIC_BASE_URL", None)


class Settings:
    GROQ_API_KEY: str = os.getenv("GROQ_API_KEY", "")
    ANTHROPIC_API_KEY: str = os.getenv("ANTHROPIC_API_KEY", "")
    GITHUB_TOKEN: str = os.getenv("GITHUB_TOKEN", "")
    GITHUB_WEBHOOK_SECRET: str = os.getenv("GITHUB_WEBHOOK_SECRET", "")
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://redis:6379/0")


settings = Settings()
