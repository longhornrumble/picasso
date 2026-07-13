# Booking Confirmation — Date, Email & Confirm Button (Hairline "12a")

Restyle the booking summary + confirm button in our chat widget to match `screenshots/12a-booking-confirm.png`. Keep the existing elements and data — a date/time, an attendee email, and a confirm action — only change their presentation. **All colors are per-tenant tokens**; the gold shown is the Atlanta Angels theme (`--tenant-accent: #a08a4a`). See the main `README.md` for the full token ramp and derivation rules.

## Summary card
- Container: `1px solid var(--hairline, #ede7d3)`, `border-radius: 12px`, `overflow: hidden`, background `--surface #fffefb`. **No shadow, no fill.**
- Two rows, each `padding: 12–13px 15px`, separated by a single `1px solid var(--hairline-soft, #f2eddc)` divider. **No pill-inside-a-box, no nested backgrounds.**
- Row 1 (date/time): 14px Lucide `calendar` icon in `--tenant-accent #a08a4a`, then the value in **13.5px / 700 / `--ink #0f172a`** — e.g. "Mon, Jul 13 · 9:00 AM".
- Row 2 (email): 14px Lucide `mail` icon in `--tenant-accent-muted #b4a67a`, then the value in **12.5px / 400 / `--ink-body #475569`**.
- Icons: 2px stroke, rounded caps/joins.

## Confirm button
- **Content-width, not full-width.** Left-aligned pill: `border-radius: 999px`, `padding: 11px 22px`, background `--tenant-accent #a08a4a`, soft glow `box-shadow: 0 4px 12px rgba(160,138,74,0.25)` (derive the glow from the tenant accent).
- Contents: 14px white `check` icon + label "Yes, book it" in **13px / 700 / #fff**, `gap: 8px`.
- Hover: lighten the fill one step (no size change). Font: Plus Jakarta Sans throughout.

## Do NOT
- Use a full-bleed slab button.
- Put the date in a filled pill inside the card.
- Add extra borders or shadows.

The goal is lighter, flatter, hairline-based — the card reads as two quiet labeled rows with a compact primary action beneath.

## Booked state (optional, see turn 12b in the canvas)
On confirm: the card marks a green "Booked" chip (Lucide `check`, `#22a45d`) at the right of row 1 and drops to `opacity: 0.85`; the user's "Yes, book it" echo and the "Booked! Your calendar invite is on its way." reply follow in the normal thread style with the standard copy/thumbs actions.
