# Hide, move and rename mirrored in /api/v1

Id: kep213-v1-effect-manage

`Aurora-kep2.13`, same call as `Aurora-pvxx.10`: external clients that read `hidden` and `order` from `GET /api/v1/effects` should be able to change them.

## Done

- `PUT /effects/{id}/hidden`, `POST /effects/{id}/move` and `PUT /effects/{id}/title` are aliases of the core routes in `PublicApiRoutes.cpp`. The existing `/api/v1/effects` write rule already gives them Apply scope.
- Spec operations `setEffectHidden`, `moveEffect` and `renameEffect` with new body and answer schemas, `openapi.json` regenerated, README line added.
- `apiVersion` stays `1.0.0`: no tag contains `/api/v1` yet, so pre-release additions fold in as in pvxx.10. No MCP tools, no tool needs them.

## Verification

- Core `[api-spec]` route walk and scope table pass with the three paths asserted as Apply.
- New `[PublicApi][v1]` case covers each route through `/api/v1`, including the 400 and 404 refusals. Full pipeline suite passes.

## Lessons

none
