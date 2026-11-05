-- lua/coerce-vision.lua — example Lua coercion: force vision to the
-- freeinference-direct lane (rhodochrosite vision is 502-broken per the probe).
-- Reads `candidates` (injected via json.decode), prints the chosen index.
for i, c in ipairs(candidates) do
  if c.provider == "freeinference-direct" and c.model == "glm-5.3-flash" then
    print(i - 1)
  end
end