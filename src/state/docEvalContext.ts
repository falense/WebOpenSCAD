import { createContext, useContext } from "react";
import { DocEval } from "../model/codegen";

export const DocEvalContext = createContext<DocEval>({
  scope: {},
  paramErrors: {},
  featureErrors: {},
  ok: true,
});

export function useDocEval(): DocEval {
  return useContext(DocEvalContext);
}
