from json import dumps, loads
from typing import Any, Dict, Type, TypeVar

from experiment_lambda.api.utils.api_models import (
    ExperimentConfiguration,
    PluginConfiguration,
)

T = TypeVar("T", bound="MlflowLogStorageModel")


class MlflowLogStorageModel(ExperimentConfiguration):
    """
    We can only store key value pairs of type dict[str, str] in mlflow parameters.
    Since we have complex logic we need to serialize to json. Hence, we add a _json field for
    the complex objects and use pydantic to convert between json and object representation.

    mlflow has a character limitation of 6k for each value.
    """

    def model_dump_for_storage(self) -> dict[str, Any]:
        """Custom dump method for storage that excludes 'plugins' and includes 'plugins_json'"""
        base_dict: Dict[str, Any] = self.model_dump(exclude={"plugins"})
        base_dict["plugins_json"] = dumps([plugin.model_dump() for plugin in self.plugins])
        return base_dict

    @classmethod
    def model_load_from_storage(cls: Type[T], data: dict[str, Any]) -> T:
        """Custom load method that processes plugins_json into plugins"""
        if "plugins_json" in data:
            plugins_data = loads(data["plugins_json"])
            data["plugins"] = [PluginConfiguration(**plugin) for plugin in plugins_data]
            del data["plugins_json"]
        return cls(**data)
