from config import settings

# Every suite runs against its own Qdrant folder, so real uploads stay untouched
# and the local-mode lock never clashes with a running uvicorn
settings.qdrant_path = "eval_qdrant_data"
settings.qdrant_collection = "hotpot"
# Eval questions come without attachments, so search the whole collection
settings.search_scope = "all"
