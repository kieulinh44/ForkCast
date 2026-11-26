"""Actual bounded Pillow decoding, never remote URLs or inferred file type."""
import base64
from io import BytesIO
import pytest
from PIL import Image
from pydantic import ValidationError
from backend.check_endpoints import red_png


def test_valid_image_payload():
    from backend.images import validate_image
    assert validate_image(red_png()) == red_png()

@pytest.mark.parametrize('data', ['https://example.org/menu.png', 'data:image/png;base64,AAAA', 'data:image/svg+xml;base64,PHN2Zz4=', red_png().replace('image/png','image/jpeg'), red_png()[:-12]])
def test_invalid_images_fail_decode_or_mime(data):
    from backend.images import validate_image
    with pytest.raises(ValueError):
        validate_image(data)


def test_explicit_pixel_limit_rejects_oversize_image(monkeypatch):
    from backend import images
    monkeypatch.setattr(images, 'MAX_PIXELS', 100)
    with pytest.raises(ValueError):
        images.validate_image(red_png())

@pytest.mark.parametrize('fmt,mime',[('JPEG','jpeg'),('PNG','png'),('WEBP','webp')])
def test_supported_formats_are_actually_loaded(fmt,mime):
    from backend.images import validate_image
    output = BytesIO()
    Image.new('RGB',(5,5),'red').save(output,format=fmt)
    data = 'data:image/'+mime+';base64,'+base64.b64encode(output.getvalue()).decode()
    assert validate_image(data) == data
