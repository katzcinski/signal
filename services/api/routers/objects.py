from fastapi import APIRouter, Depends
from typing import List, Optional

from services.api.deps import get_store, get_principal
from services.api.schemas.objects import ObjectStatusSchema, CheckHistoryPoint

router = APIRouter(tags=["objects"])


@router.get("/objects", response_model=List[ObjectStatusSchema])
def list_objects(store=Depends(get_store)):
    return store.get_object_status()


@router.get("/objects/{name}", response_model=dict)
def get_object(name: str, store=Depends(get_store)):
    latest = store.get_latest_run(name)
    if not latest:
        return {"object_name": name, "last_run": None, "checks": []}
    detail = store.get_run_detail(latest["run_id"])
    return detail


@router.get("/objects/{name}/checks/{check_name}/history", response_model=List[CheckHistoryPoint])
def get_check_history(name: str, check_name: str, limit: int = 30, store=Depends(get_store)):
    return store.get_previous_actuals(name, check_name, limit=limit)
