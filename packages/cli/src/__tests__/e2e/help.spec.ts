import path from "path";
import { clearStyle } from "./utils";

import { runCLI } from "@web3api/test-env-js";

const HELP = `
  w3             🔥 Web3API CLI 🔥                                      
  help (h)       -                                                    
  test-env (t)   Manage a test environment for Web3API                
  query (q)      Query Web3APIs using recipe scripts                  
  create (c)     Create a new project with w3 CLI                     
  codegen (g)    Auto-generate API Types                              
  build (b)      Builds a Web3API and (optionally) uploads it to IPFS 
`;

describe("e2e tests for no help", () => {
  const projectRoot = path.resolve(__dirname, "../project/");
  
  test("Should display the help content", async () => {
    const { exitCode: code, stdout: output, stderr: error } = await runCLI({
      args: ["help"],
      cwd: projectRoot
    }, "../../../bin/w3");

    expect(code).toEqual(0);
    expect(error).toBe("");
    expect(clearStyle(output)).toContain(HELP);
  });
});
