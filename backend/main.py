from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse
import json
import asyncio

from graph import create_dispute_graph
from models import DisputeState, DebateTurn
from typing import Dict, Any, Optional, List

app = FastAPI(title="Chargeback Dispute Resolver API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

import base64
import os

class DisputeRequest(BaseModel):
    dispute_id: str
    customer_claim: str
    merchant_logs: str
    customer_images: Optional[List[str]] = None

@app.post("/api/resolve")
async def resolve_dispute(request: DisputeRequest):
    graph = create_dispute_graph()
    
    image_paths = []
    if request.customer_images:
        for idx, img_b64 in enumerate(request.customer_images):
            try:
                base64_data = img_b64.split(",")[1] if "," in img_b64 else img_b64
                image_data = base64.b64decode(base64_data)
                img_path = f"/tmp/{request.dispute_id}_evidence_{idx}.png"
                with open(img_path, "wb") as f:
                    f.write(image_data)
                image_paths.append(img_path)
            except Exception as e:
                print(f"Error saving image {idx}: {e}")
                
    initial_state = DisputeState(
        dispute_id=request.dispute_id,
        customer_claim=request.customer_claim,
        merchant_logs=request.merchant_logs,
        debate_history=[],
        verdict=None,
        next_agent="customer_agent",
        customer_image_paths=image_paths if image_paths else None
    )

    async def event_generator():
        # Stream events from LangGraph
        # .astream streams outputs node by node
        async for output in graph.astream(initial_state):
            # Output is a dict mapping node_name -> state_update
            for node, state_update in output.items():
                
                # To make models JSON serializable
                if "verdict" in state_update and state_update["verdict"] is not None:
                    state_update["verdict"] = state_update["verdict"].dict()
                if "debate_history" in state_update:
                    state_update["debate_history"] = [t.dict() for t in state_update["debate_history"]]

                event_data = {
                    "node": node,
                    "state": state_update
                }
                yield {
                    "event": "message",
                    "data": json.dumps(event_data)
                }
                await asyncio.sleep(1) # Add delay for UI animation effect
        yield {
            "event": "close",
            "data": "done"
        }

    return EventSourceResponse(event_generator())
