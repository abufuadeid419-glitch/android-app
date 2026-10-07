"""Smart System — legacy FastAPI edge.

The application has been fully migrated to Convex: the entire REST surface
(`/api/...`), authentication, file uploads and all data now live in the Convex
deployment and are served from its HTTP domain (EXPO_PUBLIC_BACKEND_URL points
there). MongoDB is no longer used — there is NO database connection here.

This process stays up only so the platform's supervisor has a healthy backend
service; it holds no data and no Mongo/motor client.
"""
from fastapi import FastAPI, APIRouter
from starlette.middleware.cors import CORSMiddleware

app = FastAPI()
api = APIRouter(prefix="/api")


@api.get("/")
async def root():
    return {"message": "Smart System API has moved to Convex", "backend": "convex", "mongodb": False}


@api.get("/health")
async def health():
    return {"ok": True}


app.include_router(api)
app.add_middleware(CORSMiddleware, allow_credentials=True, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
