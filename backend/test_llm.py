import asyncio
from llm import run_llm

async def main():
    print("Running...")
    res = await run_llm("System test", "User test")
    print("Result:", res)

asyncio.run(main())
