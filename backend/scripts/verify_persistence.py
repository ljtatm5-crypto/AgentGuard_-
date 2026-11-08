from pathlib import Path
import sys
from uuid import uuid4

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.db.session import SessionLocal, check_db_connection
from app.models.entities import Agent


def main() -> None:
    check_db_connection()
    agent_id = uuid4().hex
    with SessionLocal() as db:
        db.add(Agent(id=agent_id, name="persistence-check", adapter="mock"))
        db.commit()
    with SessionLocal() as db:
        persisted = db.get(Agent, agent_id)
        assert persisted is not None, "record disappeared after a new SQLAlchemy session"
        db.delete(persisted)
        db.commit()
    print(f"database persistence verified: {agent_id}")


if __name__ == "__main__":
    main()
