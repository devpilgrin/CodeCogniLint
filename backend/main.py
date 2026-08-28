from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import rules, analysis, settings, workspace, reports, gitops

app = FastAPI(title="CodeCogniLint API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(rules.router, prefix="/api")
app.include_router(analysis.router, prefix="/api")
app.include_router(settings.router, prefix="/api")
app.include_router(workspace.router, prefix="/api")
app.include_router(reports.router, prefix="/api")
app.include_router(gitops.router, prefix="/api")


@app.get("/api/health")
def health():
    return {"status": "ok", "version": "1.0.0"}
