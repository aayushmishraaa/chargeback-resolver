from langgraph.graph import StateGraph, END
from models import DisputeState
from agents import customer_agent, merchant_agent, arbiter_judge

def route_arbiter(state: DisputeState) -> str:
    # Next agent is dictated by Arbiter
    if state.get("verdict") is not None:
        return END
    next_agent = state.get("next_agent")
    if next_agent == "customer_agent":
        return "customer_agent"
    if next_agent == "merchant_agent":
        return "merchant_agent"
    return END

def create_dispute_graph():
    """
    Constructs the core FSM for the chargeback dispute resolution process.
    """
    workflow = StateGraph(DisputeState)
    
    # Register Nodes
    workflow.add_node("customer_agent", customer_agent)
    workflow.add_node("merchant_agent", merchant_agent)
    workflow.add_node("arbiter_judge", arbiter_judge)
    
    # Define Edges
    workflow.set_entry_point("customer_agent")
    
    # Both agents route directly back to Arbiter for review
    workflow.add_edge("customer_agent", "arbiter_judge")
    workflow.add_edge("merchant_agent", "arbiter_judge")
    
    # Arbiter conditionally routes back to agents or ends
    workflow.add_conditional_edges(
        "arbiter_judge",
        route_arbiter,
        {
            "customer_agent": "customer_agent",
            "merchant_agent": "merchant_agent",
            END: END
        }
    )
    
    return workflow.compile()
