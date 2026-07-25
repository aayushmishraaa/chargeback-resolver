import asyncio

async def run_llm(system: str, user: str) -> str:
    """
    Executes a prompt against the Antigravity CLI LLM provider in headless mode.
    """
    prompt = f"System Instruction: {system}\\n\\nUser Input: {user}"
    try:
        process = await asyncio.create_subprocess_exec(
            "agy", "--print", prompt, "--dangerously-skip-permissions",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        stdout, stderr = await process.communicate()
        
        if process.returncode != 0:
            return f"SYSTEM ERROR: agy CLI failed with error: {stderr.decode('utf-8', errors='ignore').strip()}"
            
        return stdout.decode('utf-8', errors='ignore').strip()
    except asyncio.CancelledError:
        if 'process' in locals() and process.returncode is None:
            process.kill()
        raise
    except Exception as e:
        return f"SYSTEM ERROR: Subprocess Exception - {str(e)}"
