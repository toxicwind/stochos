// src/lua.ts — Lua coercion surface.
//
// The architect's directive (2026-11-05): "add sdk that takes lua for
// coercion as well". A Lua script can override/coerce the route selection at
// runtime — e.g. force a specific (provider, model), or block a dead model.
// The script receives the candidate list and returns the chosen index (or -1
// to fall through to the router's default resolution).
//
// Uses the system `lua` interpreter (5.1/5.4/luajit all present). A minimal
// JSON decoder is injected so the script reads candidates from stdin. The
// script prints the chosen index to stdout. Failures fall through (index -1) —
// coercion never blocks routing.

import { spawnSync } from "node:child_process";

export interface LuaCoercionInput {
  role: string;
  router: string;
  candidates: Array<{ provider: string; model: string; concurrency?: number }>;
}

export interface LuaCoercionResult {
  /** The chosen candidate index, or -1 to fall through. */
  index: number;
  /** Raw script stdout (trimmed). */
  output: string;
}

const LUA_BIN = process.env.STOCHOS_LUA_BIN ?? "lua";

// Minimal JSON decoder for the candidate array (objects with string/number
// fields). Injected before the user script so `json.decode` is available.
const JSON_DECODER = `
local json = {}
function json.decode(s)
  local pos = 1
  local function skipws() while s:sub(pos,pos):match("%s") do pos = pos + 1 end end
  local function parse()
    skipws()
    local c = s:sub(pos,pos)
    if c == "[" then
      pos = pos + 1
      local arr = {}
      skipws()
      if s:sub(pos,pos) == "]" then pos = pos + 1 return arr end
      while true do
        arr[#arr+1] = parse()
        skipws()
        local d = s:sub(pos,pos)
        if d == "," then pos = pos + 1
        elseif d == "]" then pos = pos + 1 break
        else error("expected , or ]") end
      end
      return arr
    elseif c == "{" then
      pos = pos + 1
      local obj = {}
      skipws()
      if s:sub(pos,pos) == "}" then pos = pos + 1 return obj end
      while true do
        skipws()
        local k = parse()
        skipws()
        if s:sub(pos,pos) ~= ":" then error("expected :") end
        pos = pos + 1
        obj[k] = parse()
        skipws()
        local d = s:sub(pos,pos)
        if d == "," then pos = pos + 1
        elseif d == "}" then pos = pos + 1 break
        else error("expected , or }") end
      end
      return obj
    elseif c == '"' then
      pos = pos + 1
      local out = {}
      while true do
        local ch = s:sub(pos,pos)
        if ch == '"' then pos = pos + 1 break end
        if ch == "\\\\" then
          local e = s:sub(pos+1,pos+1)
          if e == "n" then out[#out+1] = "\\n" elseif e == "t" then out[#out+1] = "\\t" else out[#out+1] = e end
          pos = pos + 2
        else out[#out+1] = ch pos = pos + 1 end
      end
      return table.concat(out)
    elseif c:match("%d") or c == "-" then
      local num = s:match("^-?%d+%.?%d*", pos)
      pos = pos + #num
      return tonumber(num)
    elseif s:sub(pos,pos+3) == "true" then pos = pos + 4 return true
    elseif s:sub(pos,pos+4) == "false" then pos = pos + 5 return false
    elseif s:sub(pos,pos+3) == "null" then pos = pos + 4 return nil
    else error("unexpected char: "..c) end
  end
  local v = parse()
  return v
end
`;

/**
 * Evaluate a Lua coercion script against the candidate list. The script reads
 * the candidates from stdin via `json.decode(io.read("*a"))` and prints the
 * chosen index. Returns { index: -1 } on any failure so the router falls
 * through to default resolution — coercion never blocks.
 */
export function coerceWithLua(
  script: string,
  input: LuaCoercionInput,
  timeoutMs = 2000,
): LuaCoercionResult {
  const wrapped = `${JSON_DECODER}
local candidates = json.decode(io.read("*a"))
${script}
`;
  try {
    const res = spawnSync(LUA_BIN, ["-e", wrapped], {
      input: JSON.stringify(input.candidates),
      encoding: "utf8",
      timeout: timeoutMs,
    });
    if (res.status !== 0) return { index: -1, output: String(res.stderr ?? "").trim() };
    const idx = Number.parseInt(String(res.stdout ?? "").trim(), 10);
    if (Number.isNaN(idx)) return { index: -1, output: String(res.stdout ?? "").trim() };
    return { index: idx, output: String(res.stdout ?? "").trim() };
  } catch {
    return { index: -1, output: "" };
  }
}

/**
 * Apply a Lua coercion to a candidate list: returns the coerced index if the
 * script chose a valid candidate, else -1 (fall through).
 */
export function applyCoercion(
  script: string | undefined,
  input: LuaCoercionInput,
): number {
  if (!script) return -1;
  const r = coerceWithLua(script, input);
  if (r.index >= 0 && r.index < input.candidates.length) return r.index;
  return -1;
}