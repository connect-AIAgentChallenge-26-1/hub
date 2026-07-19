# S27-B creator decision — specialized board representative

Decision date: 2026-07-13

## Approved precedence

- `715 행사안내 > 504 일반공지`
- `721 장학공지 > 504 일반공지`

This is an explicit partial order. It must not be converted into a total ranking such as `715 > 721 > 504`. Any board pair not listed above remains unresolved and is sent to `needs_review`.

## Effect

- Resolves the eight corpus duplicate pairs.
- Selects all `715` or `721` candidates over their matching `504` candidates.
- Preserves all source links.
- Does not assign CalendarEvent IDs.
- Does not persist relations.
- Does not modify runtime candidates or ICS.
