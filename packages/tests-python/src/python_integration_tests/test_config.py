import os
from typing import Optional

import boto3


class Config:
    _api_url: Optional[str] = None
    _region: Optional[str] = None

    @classmethod
    def get_region(cls) -> str:
        """Get AWS region from boto3 session or fallback to default."""
        if cls._region is None:
            session = boto3.Session()
            cls._region = session.region_name or "eu-west-2"
        return cls._region

    @classmethod
    def get_api_url(cls) -> str:
        """Get API URL from SSM parameter store or fallback to environment variable."""
        if cls._api_url is None:
            try:
                ssm_client = boto3.client("ssm", region_name=cls.get_region())
                response = ssm_client.get_parameter(Name="/genai-etk/restApiEndpoint")
                cls._api_url = response["Parameter"]["Value"].rstrip("/")
            except Exception:
                # Fallback to environment variable if SSM fails
                cls._api_url = os.environ["GEN_AI_ETK_API_URL"].rstrip("/")
        return cls._api_url

    @property
    def REGION(self) -> str:
        return self.get_region()

    @property
    def API_URL(self) -> str:
        return self.get_api_url()
