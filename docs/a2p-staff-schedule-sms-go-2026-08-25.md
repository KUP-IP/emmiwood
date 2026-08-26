# A2P GO — Barber operational schedule SMS (2026-08-25)

## Decision

**GO** to send transactional **staff/barber schedule** SMS on the existing VERIFIED low-volume campaign (`QE2c6890da8086d771620e9b13fadeba0b`, Messaging Service `MG89702f0bb4aac7175ade15db9c88d9f4`) for Emmiwood production, under this plan’s execute authorization.

## Why existing campaign covers this (without waiting on re-review)

- Campaign **description** already scopes transactional appointment SMS for customers **and staff**, plus staff-security OTP — not marketing.
- New templates are **operational B2B** notices to the assigned barber’s allowlisted shop phone: book / cancel / reschedule / T−15m reminder, including customer name/phone needed to run the chair.
- Bodies include **STOP/HELP** (same hygiene as guest appointment texts).
- Guest opt-in path and samples remain unchanged; staff sends do not require guest consent.

## Samples to add on the next campaign update (not blocking this GO)

```
KUP Solutions: new booking at Emmiwood Barbers. [service] · [when]. Customer [name] [phone]. Reply STOP to opt out.
KUP Solutions: booking cancelled at Emmiwood Barbers. [service] · [when]. Customer [name] [phone]. Reply STOP to opt out.
KUP Solutions: booking rescheduled at Emmiwood Barbers. [service] · [when]. Customer [name] [phone]. Reply STOP to opt out.
KUP Solutions: starting soon at Emmiwood Barbers. [service] · [when]. Customer [name] [phone]. Reply STOP to opt out.
```

Optional `message_flow` addendum (next Usa2p POST): shop barbers may receive operational appointment notices at numbers stored on the barber roster; not marketing; STOP/HELP apply.

## Constraints

- No staff Twilio send before this GO (satisfied by recording this file + plan execute).
- Dual-use test seed of Isaiah’s E.164 on barber `barro` is time-boxed; restore or defer-GO required at closeout.
- Scheduler enable remains a separate Wave 3 inventory Ship Gate.
