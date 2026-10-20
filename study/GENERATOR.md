# Generator: Pollinations anonymous image endpoint (dated 2026-10-17)

- Auth: none for the anonymous GET endpoint (verified by probe: HTTP 200 without a key). Keys exist at enter.pollinations.ai for gen.pollinations.ai (not used).
- Endpoint: GET https://image.pollinations.ai/prompt/{prompt}?width&height&seed&nologo, sync, returns image/jpeg (verified by probe).
- Models: /models returns ["sana"] (verified). model= has no visible effect (verified: same image for flux/turbo at the same seed).
- Reference images: not supported on this endpoint -> max_refs 0. The style bible carries the look instead.
- Sizes: a 1344x768 request returned 1015x580 (verified) -> plugin scales requests to <= ~0.59 MP.
- Native transparency: none -> key colour (magenta / green per asset).
- Seeds: seed= is honoured (same seed + prompt -> same image, verified on two calls).
- Output: JPEG with a small logo bottom-right (nologo ignored without an account) -> plugin crops the bottom 5.5%.
- Pricing: free, budget = 0. No account.
- Rate limits: ~6-8 s per image observed; 3-4 parallel requests worked.
