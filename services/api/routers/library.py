import sys
import os
from fastapi import APIRouter

router = APIRouter(tags=["library"])

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "..", "packages"))


@router.get("/library")
def get_library():
    from dq_core.library.check_library import CheckLibrary
    lib = CheckLibrary()
    return {"version": lib.get_version(), "checks": lib.list_checks()}
