from mcp.server import FastMCP
from strands_tools.calculator import calculator

from evaluator_agent_as_judge.tools import verdict

mcp = FastMCP("judge-tools")

# SymPy-backed calculator so the judge can do exact arithmetic instead of
# guessing numbers (e.g. weighted scores, tolerances, unit conversions).
mcp.tool()(calculator)

# Setup our verdict-related tools
verdict.register(mcp)

if __name__ == "__main__":
    mcp.run(transport="stdio")
