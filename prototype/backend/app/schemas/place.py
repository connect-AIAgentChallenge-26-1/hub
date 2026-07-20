from pydantic import BaseModel


class PlaceRead(BaseModel):
    name: str
    category: str
    address: str
    road_address: str
    telephone: str
    link: str


class PlaceSearchResponse(BaseModel):
    items: list[PlaceRead]
