import logging
from typing import List

from awssolutions_gen_ai_evaluation_toolkit_python_client import ApiClient, DefaultApi
from awssolutions_gen_ai_evaluation_toolkit_python_client.models import (
    CreateAnnotationSchemaRequestContent,
    ArchiveAnnotationSchemaRequestContent,
)

logger = logging.getLogger(__name__)


class ScopedAnnotationSchemaManager:
    """Manager for creating and cleaning up annotation schemas in tests."""

    def __init__(self, genaietk_client: ApiClient) -> None:
        self.genaietk_client = genaietk_client
        self.api = DefaultApi(genaietk_client)
        self._created_schemas: List[str] = []

    def create_annotation_schema(self, name: str, value_type, description: str = "Test annotation schema"):
        """Create an annotation schema and track it for cleanup."""
        request = CreateAnnotationSchemaRequestContent(
            name=name,
            value_type=value_type,
            description=description,
        )
        
        schema = self.api.create_annotation_schema(request)
        
        if schema and schema.name:
            self._created_schemas.append(schema.name)
            logger.info(f"Created annotation schema: {schema.name}")
        
        return schema

    def try_cleanup(self) -> List[str]:
        """Clean up all created annotation schemas. Returns list of errors."""
        errors = []
        
        for schema_name in self._created_schemas:
            try:
                archive_request = ArchiveAnnotationSchemaRequestContent()
                self.api.archive_annotation_schema(
                    annotation_name=schema_name,
                    archive_annotation_schema_request_content=archive_request
                )
                logger.info(f"Archived annotation schema: {schema_name}")
            except Exception as e:
                error_msg = f"Failed to archive annotation schema {schema_name}: {str(e)}"
                logger.error(error_msg)
                errors.append(error_msg)
        
        self._created_schemas.clear()
        return errors
