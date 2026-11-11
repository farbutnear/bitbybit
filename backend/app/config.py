from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """All settings can be overridden with SYSDRILL_* environment variables or a .env file."""

    model_config = SettingsConfigDict(env_file=".env", env_prefix="SYSDRILL_", extra="ignore")

    database_url: str = "sqlite:///./sysdrill.db"

    # Lesson composition
    session_size: int = 10
    new_cards_per_day: int = 5

    # Defaults for new users
    default_daily_goal: int = 5
    default_reminder_hour: int = 20
    starting_streak_freezes: int = 1
    max_streak_freezes: int = 2

    # FSRS target probability of recall at review time
    desired_retention: float = 0.9

    # Expo push service
    expo_push_url: str = "https://exp.host/--/api/v2/push/send"
    expo_access_token: str | None = None  # only needed if you enable "enhanced security" in Expo

    # Reminder worker
    worker_interval_seconds: int = 60
    worker_batch_size: int = 500

    # Exposes /debug/* routes (test push, run reminder tick). Turn off in production.
    enable_debug_routes: bool = True


settings = Settings()
