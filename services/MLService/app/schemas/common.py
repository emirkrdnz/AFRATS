from pydantic import BaseModel, Field
from typing import Any, Optional
import uuid


class ApiResponse(BaseModel):
    success: bool
    data: Optional[Any] = None
    message: Optional[str] = None
    errors: list[str] = Field(default_factory=list)
    traceId: str = ""

    @classmethod
    def ok(cls, data: Any = None, message: str = "") -> "ApiResponse":
        return cls(
            success=True,
            data=data,
            message=message,
            errors=[],
            traceId=str(uuid.uuid4())
        )

    @classmethod
    def fail(cls, errors: list[str], message: str = "") -> "ApiResponse":
        return cls(
            success=False,
            data=None,
            message=message,
            errors=errors,
            traceId=str(uuid.uuid4())
        )