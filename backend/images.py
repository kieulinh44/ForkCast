"""Validate actual menu image bytes without retaining or trusting MIME claims."""
import base64
import binascii
from io import BytesIO
import re
import warnings
from PIL import Image, UnidentifiedImageError

MAX_PIXELS = 20_000_000
MAX_IMAGE_BYTES = 3_800_000
FORMAT = {'jpeg':'JPEG', 'png':'PNG', 'webp':'WEBP'}


def validate_image(value):
    if not isinstance(value,str) or len(value) > 5_100_000:
        raise ValueError('Invalid image')
    match = re.fullmatch(r'data:image/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})',value)
    if not match:
        raise ValueError('Invalid image')
    try:
        data = base64.b64decode(match.group(2),validate=True)
        if not data or len(data) > MAX_IMAGE_BYTES:
            raise ValueError('Invalid image')
        with warnings.catch_warnings():
            warnings.simplefilter('error', Image.DecompressionBombWarning)
            with Image.open(BytesIO(data)) as image:
                if image.format != FORMAT[match.group(1)] or image.width * image.height > MAX_PIXELS or getattr(image,'n_frames',1) != 1:
                    raise ValueError('Invalid image')
                image.verify()
            with Image.open(BytesIO(data)) as image:
                image.load()
    except (OSError, ValueError, SyntaxError, binascii.Error, Image.DecompressionBombWarning, Image.DecompressionBombError, UnidentifiedImageError):
        raise ValueError('Invalid image') from None
    return value
