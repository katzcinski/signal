from fastapi import APIRouter
from dq_core.library import checks, categories

router = APIRouter(prefix="/api/library", tags=["library"])


@router.get("")
def get_library():
    return {"categories": categories(), "checks": checks()}
