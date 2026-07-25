from typing import List, Optional, Annotated, Dict
import operator
from pydantic import BaseModel, Field
from typing_extensions import TypedDict

class Verdict(BaseModel):
    winner: str = Field(description="Who won the dispute: 'merchant' or 'customer'")
    scores: Dict[str, float] = Field(description="Dictionary of scores for different criteria")
    confidence_score: float = Field(description="Confidence score between 0 and 1")
    justification: str = Field(description="Detailed justification for the verdict")

class DebateTurn(BaseModel):
    agent: str
    argument: str

class DisputeState(TypedDict):
    dispute_id: str
    merchant_logs: str
    customer_claim: str
    customer_image_paths: Optional[List[str]]
    debate_history: Annotated[List[DebateTurn], operator.add]
    next_agent: str
    verdict: Optional[Verdict]
