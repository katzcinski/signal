from dataclasses import dataclass, field
from typing import List


@dataclass
class Principal:
    sub: str
    name: str
    roles: List[str] = field(default_factory=list)


def get_noauth_principal() -> Principal:
    return Principal(sub="local", name="Local Admin", roles=["admin", "owner", "steward", "viewer"])
