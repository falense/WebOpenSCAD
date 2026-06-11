import { useEffect, useState } from "react";
import { Scope, evaluate, validateExpr } from "../model/expr";

interface Props {
  value: string;
  scope: Scope;
  onCommit: (value: string) => void;
  placeholder?: string;
  title?: string;
}

/**
 * Input that accepts a numeric expression referencing model parameters.
 * Validates as you type, shows the evaluated value, commits on blur/Enter.
 */
export default function ExpressionInput({ value, scope, onCommit, placeholder, title }: Props) {
  const [text, setText] = useState(value);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setText(value);
  }, [value, focused]);

  const error = validateExpr(text, scope);
  let hint = title ?? "";
  if (!error) {
    try {
      const v = evaluate(text, scope);
      const isPlainNumber = /^-?[0-9.]+$/.test(text.trim());
      if (!isPlainNumber) hint = `= ${+v.toFixed(4)}`;
    } catch {
      // unreachable: validateExpr passed
    }
  } else {
    hint = error;
  }

  const commit = () => {
    if (text !== value && !validateExpr(text, scope)) onCommit(text);
  };

  return (
    <input
      className={`expr-input${error ? " expr-error" : ""}`}
      type="text"
      value={text}
      placeholder={placeholder}
      title={hint}
      spellCheck={false}
      onChange={(e) => setText(e.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false);
        commit();
        if (validateExpr(text, scope)) setText(value);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          commit();
          (e.target as HTMLInputElement).blur();
        } else if (e.key === "Escape") {
          setText(value);
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}
