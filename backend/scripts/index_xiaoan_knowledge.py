from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.db.session import SessionLocal, init_db
from app.services.xiaoan.knowledge_loader import ensure_xiaoan_knowledge


def main() -> None:
    init_db()
    with SessionLocal() as db:
        result = ensure_xiaoan_knowledge(db)
    print(
        "XiaoAn knowledge indexed: "
        f"version={result['version']} documents={result['documents']} "
        f"chunks={result['chunks']} updated={result['updated']} unchanged={result['unchanged']}"
    )


if __name__ == "__main__":
    main()
