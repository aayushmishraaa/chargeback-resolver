import asyncio
import shutil
import os

async def run_llm(system: str, user: str) -> str:
    """
    Executes a prompt against the Antigravity CLI LLM provider in headless mode.
    """
    prompt = f"System Instruction: {system}\n\nUser Input: {user}"
    
    # Use a login shell so that .bashrc/.profile paths are loaded, 
    # fixing the pm2 daemon PATH issue where `agy` cannot be found.
    # We pass the prompt via an environment variable to prevent shell injection.
    env = os.environ.copy()
    env["AGY_PROMPT"] = prompt
    
    bash_command = 'agy --print "$AGY_PROMPT" --dangerously-skip-permissions'
    
    try:
        # -l ensures it acts as a login shell (loads profiles)
        process = await asyncio.create_subprocess_exec(
            "bash", "-l", "-c", bash_command,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=env
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
