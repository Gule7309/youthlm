import ast
import unittest
from pathlib import Path


class AgentCoreSmokeContractTests(unittest.TestCase):
    def test_smoke_handler_does_not_import_youthlm_application(self) -> None:
        source_path = Path("spikes/agentcore_smoke/main.py")
        tree = ast.parse(source_path.read_text(encoding="utf-8"))
        imported_modules = {
            alias.name
            for node in ast.walk(tree)
            if isinstance(node, ast.Import)
            for alias in node.names
        }
        imported_from_modules = {
            node.module
            for node in ast.walk(tree)
            if isinstance(node, ast.ImportFrom) and node.module
        }

        all_imports = imported_modules | imported_from_modules

        self.assertFalse(any(name == "app" or name.startswith("app.") for name in all_imports))


if __name__ == "__main__":
    unittest.main()
