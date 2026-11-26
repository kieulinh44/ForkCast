"""Strict browser-state schema; validation errors never echo submitted data."""
import base64
import binascii
import re
from typing import Annotated, Literal
from urllib.parse import urlsplit
from pydantic import BaseModel, ConfigDict, Field, StrictStr, field_validator

Text = Annotated[StrictStr, Field(max_length=2000)]
Revision = Annotated[int, Field(strict=True, ge=0, le=9223372036854775806)]

class StrictModel(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)

class Feedback(StrictModel):
    dish: Annotated[str, Field(max_length=200)]
    rating: Annotated[int, Field(ge=1, le=5)]
    notes: Annotated[str, Field(max_length=5000)]
    photo: Annotated[str, Field(max_length=700000)] | None = None

    @field_validator('dish')
    @classmethod
    def required_dish(cls, value):
        if not value.strip():
            raise ValueError('Dish name is required')
        return value

    @field_validator('photo')
    @classmethod
    def valid_photo(cls, value):
        if value is None:
            raise ValueError('Photo must be omitted or a JPEG data URL')
        if not re.fullmatch(r'data:image/jpeg;base64,[A-Za-z0-9+/]+={0,2}', value):
            raise ValueError('Invalid photo')
        try:
            data = base64.b64decode(value.split(',', 1)[1], validate=True)
        except (ValueError, binascii.Error):
            raise ValueError('Invalid photo') from None
        if not data.startswith(b'\xff\xd8\xff') or not data.endswith(b'\xff\xd9'):
            raise ValueError('Invalid JPEG')
        return value

class State(StrictModel):
    profile: dict[str, Text]
    mood: Literal['', 'Comforting', 'Hearty', 'Refreshing', 'Light', 'Adventurous']
    craving: Text
    feedback: Annotated[list[Feedback], Field(max_length=100)]
    menuUrl: Annotated[str, Field(max_length=2048)]
    # Optional for compatibility with existing single-link workspaces and clients.
    menuUrls: Annotated[list[Annotated[str, Field(max_length=2048)]], Field(max_length=50)] = Field(default_factory=list)

    @field_validator('profile')
    @classmethod
    def profile_keys(cls, value):
        if set(value) - {'name', 'budget', 'favorites', 'dislikes', 'dietary', 'allergies', 'spice', 'currency'}:
            raise ValueError('Invalid profile')
        if 'currency' in value and not re.fullmatch(r'[A-Z]{3}', value['currency']):
            raise ValueError('Invalid currency')
        return value

    @field_validator('menuUrl')
    @classmethod
    def valid_url(cls, value):
        if not value:
            return value
        try:
            url = urlsplit(value)
            if url.scheme not in ('http', 'https') or not url.hostname or url.username is not None or url.password is not None or any(ord(c) < 33 for c in value) or '\\' in value:
                raise ValueError('Invalid URL')
            _ = url.port
        except ValueError:
            raise ValueError('Invalid URL') from None
        return value

    @field_validator('menuUrls')
    @classmethod
    def valid_menu_urls(cls, value):
        for url in value:
            if not url:
                raise ValueError('Menu links must not be empty')
            cls.valid_url(url)
        if len(set(value)) != len(value):
            raise ValueError('Duplicate menu links')
        return value

class PutState(StrictModel):
    state: State
    revision: Revision

class DeleteState(StrictModel):
    revision: Revision
