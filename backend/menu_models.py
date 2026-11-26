"""Strict editable menu and revision-bearing workflow inputs."""
import math
import re
from typing import Annotated
from pydantic import Field, field_validator, model_validator
from .models import StrictModel, Revision

class MenuItem(StrictModel):
    id: Annotated[str, Field(min_length=1, max_length=80, pattern=r'^[A-Za-z0-9_-]+$')] | None = None
    name: Annotated[str, Field(min_length=1, max_length=200)]
    description: Annotated[str, Field(max_length=2000)] = ''
    price: float | None = None
    price_note: Annotated[str, Field(max_length=300)] = ''

    @field_validator('name')
    @classmethod
    def nonblank(cls, value):
        if not value.strip():
            raise ValueError('Name required')
        return value.strip()

    @field_validator('price', mode='before')
    @classmethod
    def valid_price(cls, value):
        if value is not None and (type(value) not in (int, float) or not math.isfinite(value) or value < 0):
            raise ValueError('Invalid price')
        return value

class MenuInput(StrictModel):
    restaurant_name: Annotated[str, Field(max_length=200)] = ''
    currency: Annotated[str, Field(pattern=r'^[A-Z]{3}$')] | None = None
    items: Annotated[list[MenuItem], Field(min_length=1, max_length=40)]

    @model_validator(mode='after')
    def unique_ids(self):
        ids = [item.id for item in self.items if item.id is not None]
        if len(ids) != len(set(ids)):
            raise ValueError('Duplicate IDs')
        return self

class WorkflowVersion(StrictModel):
    menu_revision: Revision
    state_revision: Revision

class PutMenu(WorkflowVersion):
    menu: MenuInput
    manual_replacement: bool = False

class ExtractMenu(WorkflowVersion):
    image_data: Annotated[str, Field(max_length=5_100_000)]

    @field_validator('image_data')
    @classmethod
    def actual_image(cls,value):
        from .images import validate_image
        return validate_image(value)

class PhotoItem(MenuItem):
    id: None = None

class PhotoMenu(MenuInput):
    items: Annotated[list[PhotoItem], Field(max_length=40)]
