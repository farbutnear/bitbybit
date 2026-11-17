from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """All settings can be overridden with BITBYBIT_* environment variables or a .env file."""

    model_config = SettingsConfigDict(env_file=".env", env_prefix="BITBYBIT_", extra="ignore")

    database_url: str = "sqlite:///./bitbybit.db"

    # How many cards a review session holds at most
    session_size: int = 10

    # Defaults for new users
    default_daily_goal: int = 5
    default_reminder_hour: int = 20
    starting_streak_freezes: int = 1
    max_streak_freezes: int = 2
    starting_bits: int = 100  # enough for one card pack

    # FSRS target probability of recall at review time
    desired_retention: float = 0.9

    # Expo push service
    expo_push_url: str = "https://exp.host/--/api/v2/push/send"
    expo_access_token: str | None = None  # only needed if you enable "enhanced security" in Expo

    # Reminder worker
    worker_interval_seconds: int = 60
    worker_batch_size: int = 500

    # No migrations yet: when the schema version changes, rebuild the database on startup.
    # Set to false once there is data worth keeping.
    reset_db_on_schema_change: bool = True

    # Exposes /debug/* routes (test push, run reminder tick). Turn off in production.
    enable_debug_routes: bool = True


settings = Settings()
