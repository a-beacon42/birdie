"""Application settings loaded from environment variables."""

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Central configuration – reads from environment variables or .env file."""

    # Cosmos DB
    cosmos_endpoint: str = ""
    cosmos_key: str = ""
    cosmos_database: str = "birdie"

    # eBird API
    ebird_api_key: str = ""

    # Azure OpenAI
    azure_openai_endpoint: str = ""
    azure_openai_api_key: str = ""
    azure_openai_deployment_name: str = ""
    azure_openai_api_version: str = "2025-01-01-preview"

    # API authentication
    api_key: str = ""  # Required for chat endpoint; set in .env

    # Rate limiting
    chat_rate_limit: str = "10/minute"  # slowapi rate string

    # CORS
    allowed_origins: str = "http://localhost:8081,http://localhost:19006"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]


settings = Settings()
