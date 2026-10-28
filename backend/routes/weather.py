import weather
from db import add_place, delete_place, get_place, home_place, list_places, set_home
from fastapi import APIRouter, HTTPException
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, Field

router = APIRouter(prefix="/weather", tags=["weather"])


class NewPlace(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    region: str = ""
    country: str = ""
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)


async def for_place(place: dict) -> dict:
    try:
        data = await run_in_threadpool(weather.forecast, place["lat"], place["lon"])
    except Exception as e:
        raise HTTPException(502, f"forecast unavailable ({type(e).__name__})")
    return {**data, "place": place}


@router.get("")
async def forecast(place_id: int | None = None, lat: float | None = None, lon: float | None = None):
    """Home's forecast, a saved place's, or one for raw coordinates (the browser's location)."""
    if lat is not None and lon is not None:
        place = {"id": None, "name": "My location", "region": "", "country": "", "lat": lat, "lon": lon, "is_home": 0}
    else:
        place = get_place(place_id) if place_id is not None else home_place()
    if not place:
        raise HTTPException(404, "no such place; add one first")
    return await for_place(place)


@router.get("/alert")
async def alert():
    """Home's rain alert alone, for the banner; null when there is none."""
    place = home_place()
    if not place:
        return {"alert": None}
    data = await for_place(place)
    return {"alert": data["alert"], "place": place["name"]}


@router.get("/search")
async def search(q: str):
    if len(q.strip()) < 2:
        return []
    try:
        return await run_in_threadpool(weather.search, q.strip())
    except Exception as e:
        raise HTTPException(502, f"search unavailable ({type(e).__name__})")


@router.get("/places")
def places():
    return list_places()


@router.post("/places")
def new_place(body: NewPlace):
    return add_place(body.name, body.region, body.country, body.lat, body.lon)


@router.post("/places/{place_id}/home")
def make_home(place_id: int):
    if not get_place(place_id):
        raise HTTPException(404, "no such place")
    set_home(place_id)
    return list_places()


@router.delete("/places/{place_id}")
def remove_place(place_id: int):
    place = get_place(place_id)
    if not place:
        raise HTTPException(404, "no such place")
    if place["is_home"]:
        raise HTTPException(400, "Home cannot be removed; make another place Home first")
    delete_place(place_id)
    return list_places()
