import json
from models import DisputeState, DebateTurn, Verdict
from llm import run_llm
from prompts import CUSTOMER_AGENT_SYSTEM, MERCHANT_AGENT_SYSTEM, ARBITER_JUDGE_SYSTEM

async def customer_agent(state: DisputeState) -> dict:
    history_len = len(state.get("debate_history", []))
    
    context = f"Customer Claim: {state['customer_claim']}"
    if history_len > 0:
        last_turn = state['debate_history'][-1]
        if last_turn.agent == 'arbiter':
            context += f"\\n\\nThe Arbiter has directly intervened: {last_turn.argument}\\n\\nAddress the Arbiter's demands forcefully."
        else:
            context += f"\\n\\nThe merchant just argued: {last_turn.argument}\\n\\nProvide a sharp, strategic rebuttal."
            
    img_paths = state.get('customer_image_paths', [])
    if img_paths:
        paths_str = ", ".join([f"`{p}`" for p in img_paths])
        context += f"\\n\\nCRITICAL: The customer has uploaded images as evidence located at: {paths_str}. You MUST use your view_file tool to read ALL these images and use their contents forcefully in your argument against the merchant!"
         
    argument = await run_llm(system=CUSTOMER_AGENT_SYSTEM, user=context)
    turn = DebateTurn(agent="customer", argument=argument)
    return {"debate_history": [turn]}

async def merchant_agent(state: DisputeState) -> dict:
    history_len = len(state.get("debate_history", []))
    
    context = f"Merchant Telemetry Logs: {state['merchant_logs']}"
    if history_len > 0:
        last_turn = state['debate_history'][-1]
        if last_turn.agent == 'arbiter':
            context += f"\\n\\nThe Arbiter has directly intervened: {last_turn.argument}\\n\\nProvide the technical evidence requested by the Arbiter."
        else:
            context += f"\\n\\nThe customer just argued: {last_turn.argument}\\n\\nProvide a definitive, technical rebuttal proving liability shift."
            
    img_paths = state.get('customer_image_paths', [])
    if img_paths:
        paths_str = ", ".join([f"`{p}`" for p in img_paths])
        context += f"\\n\\nWARNING: The customer has uploaded images as evidence located at: {paths_str}. You MUST use your view_file tool to read ALL these images and find a way to dismiss or discredit them using your telemetry logs."

    argument = await run_llm(system=MERCHANT_AGENT_SYSTEM, user=context)
    turn = DebateTurn(agent="merchant", argument=argument)
    return {"debate_history": [turn]}

async def arbiter_judge(state: DisputeState) -> dict:
    history = "\\n\\n".join([f"[{t.agent.upper()} AGENT]: {t.argument}" for t in state["debate_history"]])
    
    user_prompt = f"FINAL DEBATE TRANSCRIPT FOR REVIEW:\\n{history}"
    img_paths = state.get('customer_image_paths', [])
    if img_paths:
        paths_str = ", ".join([f"`{p}`" for p in img_paths])
        user_prompt += f"\\n\\nNOTE: The customer has submitted visual evidence located at: {paths_str}. You MUST use your view_file tool to inspect ALL these images before issuing a verdict."
        
    response_text = await run_llm(
        system=ARBITER_JUDGE_SYSTEM,
        user=user_prompt
    )
    
    try:
        clean_text = response_text.replace("```json", "").replace("```", "").strip()
        verdict_data = json.loads(clean_text)
        
        if verdict_data.get("status") == "continue":
            intervention_text = verdict_data.get("intervention", "Please provide more evidence.")
            next_agent = verdict_data.get("next_agent", "customer_agent")
            turn = DebateTurn(agent="arbiter", argument=intervention_text)
            return {
                "debate_history": [turn],
                "next_agent": next_agent
            }
        else:
            v_data = verdict_data.get("verdict", {})
            verdict = Verdict(
                winner=v_data.get("winner", "merchant"),
                scores=v_data.get("scores", {"evidence_quality": 0, "policy_adherence": 0, "logical_consistency": 0}),
                confidence_score=v_data.get("confidence_score", 0.0),
                justification=v_data.get("justification", "No justification provided.")
            )
            return {"verdict": verdict, "next_agent": "END"}
    except Exception as e:
        verdict = Verdict(
            winner="merchant", 
            scores={"error": 0.0},
            confidence_score=0.0, 
            justification=f"CRITICAL PARSING ERROR. Raw LLM output: {response_text[:150]}"
        )
        return {"verdict": verdict, "next_agent": "END"}
