"""Cross-platform Agent adapters.

The registry is the only place that knows concrete remote protocols.  The
legacy ``agent_adapter`` module remains the public execution entry point so
existing API and tests keep working while new platforms are added here.
"""

from .base import AdapterCapabilities, AdapterProtocolError, AdapterResult
from .registry import get_adapter_capabilities, invoke_remote, release_remote_session

__all__ = [
    "AdapterCapabilities",
    "AdapterProtocolError",
    "AdapterResult",
    "get_adapter_capabilities",
    "invoke_remote",
    "release_remote_session",
]