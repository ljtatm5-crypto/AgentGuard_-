import os


# Router-focused tests intentionally exercise local SQLite behavior without
# provisioning an operator token. Production defaults remain deny-by-default.
os.environ.setdefault("AGENTGUARD_ENVIRONMENT", "test")
os.environ.setdefault("AGENTGUARD_ALLOW_ANONYMOUS_WRITES", "true")
# Keep unit tests deterministic; developers can opt into a live model explicitly.
os.environ.setdefault("AGENTGUARD_XIAOAN_LLM_ENABLED", "false")
