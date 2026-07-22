# Emmiwood UI-ITER Log

Protocol: app-dev UI Iteration Runbook (Workflow F) + web-dev D→I→Q  
Preview: http://localhost:8788  
Rule: Visual-first (F.0). After CSS/TSX edits: `npm run build` then hard-refresh with cache-bust.

## Surfaces (full site — every round)

| Path | Role |
|------|------|
| `/`, `/emmiwood` | Marketing home |
| `/emmiwood/book` (`/book`) | Booking flow |
| `/emmiwood/manage` (`/manage`) | Guest manage (token states) |
| `/emmiwood/admin` (`/admin`) | Staff sign-in + workspace |
| `/emmiwood/privacy` | Info |
| `/emmiwood/sms-terms` | Info |
| `/emmiwood/chair-rental` | Info |
| Mobile viewport (~390) | Sticky book CTA + density |

## Round ledger

| Round | Agent | Status | Top focus | Notes |
|-------|-------|--------|-----------|-------|
| 1 | Round-1 agent | done | Hero brand, CTA clarity, booking caps, mobile sticky | Build OK; verified 390 + 1280 |
| 2 | Round-2 agent | done | Mobile jump nav, hero shop photo, booking density, paper fit | Build OK; verified 390 + 1280 |
| 3 | Round-3 agent | done | Anchor offset, sticky restore, hero crop, barber disclose, info shell | Build OK; verified 390 + 1280 |
| 4 | Round-4 agent | done | Sticky choose CTA, service→barber smooth, home polish, admin/manage | Build OK; verified 390 + 1280 |
| 5 | Round-5 agent | done | Booking time/details, home CTA hierarchy, CSS calm | Build OK; verified 390 + 1280 |
| 6 | Round-6 agent | done | Review summary, availability redundancy, evening clearance, a11y | Build OK; verified 390 + 1280 |
| 7 | Round-7 agent | done | Confirmation success, barber density, motion, CSS calm | Build OK; verified 390 + 1280; mock confirm (no SMS) |
| 8 | Round-8 agent | done | Home composition system, desktop Find-next, loading shell | Build OK; verified 390 + 1280; mock confirm (no SMS) |
| 9 | Round-9 agent | done | Shop/visit prune, services rhythm, booking focus, errors, headers | Build OK; verified 390 + 1280 |
| 10 | Round-10 agent | done | Cohesion tokens, chrome copy, hover/active/disabled, reduced-motion, safe-area | Build OK; verified 390 + 1280 |
| 11 | Round-11 agent | done | Residue hunt: confusion audit → prune → consolidate; sticky CSS war | Build OK; verified 390 + 1280 |
| 12 | Round-12 agent | done | Quality lock: full-site critique, dead CSS purge, shell/focus cohesion | Build OK; verified 390 + 1280; **loop CLOSED** |

## Round 1 — 2026-07-21

### F.0 evidence
- Preview: `http://localhost:8788` → 200
- Captured: home (desktop 1280 + mobile 390), book choose + time (390), manage empty, admin sign-in, privacy, sms-terms, chair-rental
- Post-edit: `npm run build` OK; hard-refresh `?v=r1-verify-*`

### Critique → fix map
1. **P1 · booking · density/readability** — Service choice cards rendered ALL CAPS via inherited `.emmiwood label` / `.ew-app-surface label`. **Visual evidence:** book step 1 screenshot showed “SIGNATURE HAIRCUT” + uppercase descriptions. **Fix:** higher-specificity `text-transform:none` on choice/barber labels.
2. **P1 · home-mobile · CTA** — Hero Book + “Choose a service” sat on one crowded row; link hugged the right edge. **Visual evidence:** mobile hero `?v=r1-m1`. **Fix:** column-stack hero actions on ≤760px; full-width primary button.
3. **P1 · home-mobile · sticky book** — Sticky bar height matched content padding; today-card/timeline sat under the dock. **Visual evidence:** sticky bounds y≈776 overlapping card. **Fix:** `padding-bottom: calc(78px + safe-area)`; sticky safe-area padding.
4. **P1 · home · brand hierarchy** — Eyebrow was “Neighborhood barbering”; Emmiwood lived only as small nav mark. **Visual evidence:** desktop/mobile hero first viewport. **Fix:** eyebrow → `Emmiwood · Sioux Falls`; larger header mark.
5. **P2 · home · CTA clarity** — Three solid Book buttons in first desktop viewport (nav, hero, today card). **Visual evidence:** desktop hero. **Fix:** today-card Book → `.ew-button.secondary`.
6. **P2 · home · spacing** — Today card felt packed (timeline + facts + next + actions). **Visual evidence:** desktop hero card. **Fix:** slightly increased internal padding.
7. **P2 · admin · sign-in** — Large empty brand gap above “Open the shop.” **Visual evidence:** admin mobile card. **Fix:** brand `margin-bottom` 4rem → 2rem; center login shell on `100svh`.
8. **P2 · info/manage · consistency** — Shared paper-on-dark shell but uneven bottom air / width. **Visual evidence:** chair-rental vs privacy. **Fix:** shared max-width 900px, bottom padding, tighter h1 measure + body line-height.

### Files changed
- `client/src/pages/emmiwood/EmmiwoodPage.tsx`
- `client/src/pages/emmiwood/emmiwood.css`
- `docs/emmiwood-uiiter-log.md`

### Verify
- Mobile home: stacked CTAs, Emmiwood eyebrow, sticky clearance (`paddingBottom:78px`)
- Book choose: `text-transform:none`; “Signature Haircut” sentence case
- Desktop home: secondary today-card Book; Emmiwood eyebrow
- Admin: brand margin 32px

### Residual / Round 2 handoff
- Mobile header still hides Services/Barbers/Visit (no in-page nav beyond sticky Book)
- Hero still text+status-card (no dominant shop imagery) — brand-safe imagery pass
- Booking choose still long-scroll on 390; consider denser service rows or progressive disclosure
- Admin card still has surplus bottom empty space inside paper panel
- Info pages: optional shared footer strip; “Back to the shop” tap target improved but still text-only
- Desktop CTA: nav + hero Book still both solid (intentional); watch for over-competition with final CTA band

## Round 2 — 2026-07-21

### F.0 evidence
- Preview: `http://localhost:8788` → 200
- Captured: home (390 + 1280), book choose (390), manage empty, admin sign-in, privacy, sms-terms, chair-rental
- Post-edit: `npm run build` OK (×2); hard-refresh `?v=r2-verify-*`

### Critique → fix map
1. **P1 · home-mobile · nav access** — Sticky header showed brand only; Services/Barbers/Visit were `display:none` with no alternate. **Visual evidence:** `r2-home-m390` header box had no section links. **Fix:** sticky `.ew-mobile-jump` strip (Services / Barbers / Visit).
2. **P1 · home · hero plane** — First viewport was copy + today-card on flat brown; no shop imagery despite `barro-profile.webp` in repo. **Visual evidence:** desktop `r2-home-d1280` / mobile hero. **Fix:** `.ew-hero-atmosphere` using existing barro photo under brand overlays (no invented stock).
3. **P1 · booking · choose density** — Five full description cards made choose ~717px of service list alone on 390. **Visual evidence:** `r2-book-choose-m390`; page height ~2039px. **Fix:** compact name+price rows; descriptions only on selected; denser barber rows + line-clamp.
4. **P2 · admin · paper void** — Login card ~519px tall with empty form-message / padding surplus. **Visual evidence:** `r2-admin-m390` card box. **Fix:** `height:fit-content`, tighter padding/type, hide empty `.ew-form-message`.
5. **P2 · info · footer + taps** — Privacy/SMS/chair had no shared app footer; Back was plain text. Chair paper felt empty below short copy. **Visual evidence:** `r2-chair-m390` / privacy. **Fix:** shared `.ew-app-footer` on info+manage; `.ew-back-link` bordered 44px target; article `height:fit-content`.

### Files changed
- `client/src/pages/emmiwood/EmmiwoodPage.tsx`
- `client/src/pages/emmiwood/EmmiwoodInfoPage.tsx`
- `client/src/pages/emmiwood/EmmiwoodManagePage.tsx`
- `client/src/pages/emmiwood/EmmiwoodBookingPage.tsx`
- `client/src/pages/emmiwood/emmiwood.css`
- `docs/emmiwood-uiiter-log.md`

### Verify
- Mobile home: jump nav present; atmosphere loads `barro-profile.webp`; Round 1 stacked CTAs + sticky Book retained
- Book choose 390: service group ~337px (was ~717); unselected rows ~44px; selected shows description; CTA enters first-scroll sooner
- Admin: card ~393px (was ~519); no empty message gap
- Chair/privacy: content-fit paper + footer strip; Back link bordered
- Desktop 1280: jump hidden; primary nav visible; hero atmosphere + secondary today Book retained

### Residual / Round 3 handoff
- Hero photo is real but low-res square (320²) — atmospheric only; fuller shop photography still would strengthen brand plane
- Mobile jump + sticky Book + header stack eats vertical chrome; watch section-anchor offset under sticky jump
- Booking choose still scrolls past barber block before CTA on shortest phones; could progressive-disclose barber after service confirm
- Info main still `min-height` fills viewport → dark band above footer on short pages (paper itself fits now)
- Desktop dual solid Book (nav + hero) still intentional; monitor competition
- Manage empty-state OK; no token deep-link states exercised this round

## Round 3 — 2026-07-21

### F.0 evidence
- Preview: `http://localhost:8788` → 200
- Captured: home (390 + 1280), book choose deferred (390) + desktop barbers open (1280), manage empty, admin sign-in, privacy, sms-terms (`/sms-terms` alias), chair-rental
- Post-edit: `npm run build` OK (multiple); hard-refresh `?v=r3-verify-*`

### Critique → fix map
1. **P1 · home-mobile · sticky chrome broken** — `.emmiwood { overflow-x:hidden }` promoted `overflow-y:auto`, so header + jump scrolled away. **Visual evidence:** after scrollY=400, jumpTop≈−326 despite `position:sticky`. **Fix:** `overflow-x:clip` (does not create scroll containment).
2. **P1 · home-mobile · anchor offset** — `#services`/`#barbers`/`#visit` had `scroll-margin:0`; jump+header ≈112px. **Visual evidence:** pre-fix jumpBottom vs section top collision risk. **Fix:** `--ew-chrome-offset` 118px mobile / 74px desktop + `scroll-padding-top` on `html:has(.ew-public)`.
3. **P1 · booking · CTA below fold** — choose stage docH≈1544; CTA top≈1331 with barbers always open. **Visual evidence:** `r3-f0-book` metrics. **Fix:** progressive barber disclose on ≤760 (default first-available path); CTA/context before optional reveal; denser header/context. CTA top≈819 (enters first viewport).
4. **P1 · home · hero headshot read** — `cover` + face-forward crop of 320² portrait. **Visual evidence:** mobile hero face plate. **Fix:** oversized `background-size` (155–190%), desaturate/blur wash, stronger brand overlays; kept `barro-profile.webp` (og asset is graphic, not shop photo).
5. **P2 · info · dark band** — `.ew-info-page` `min-height:calc(100svh - 74px)` + footer `margin-top:auto` left void above footer. **Visual evidence:** chair gap≈84px. **Fix:** info/manage `min-height:0`; footer auto-margin only when `:has(.ew-book-page)`; gap≈16px.

### Files changed
- `client/src/pages/emmiwood/BookingFlow.tsx`
- `client/src/pages/emmiwood/emmiwood.css`
- `docs/emmiwood-uiiter-log.md`

### Verify
- Mobile home: sticky header+jump hold at scrollY=600; Services jump → servicesTop≥jumpBottom (gap≈124); R1/R2 eyebrow + sticky Book retained
- Book choose 390: barber deferred; reveal present; CTA top≈819 (was≈1331); `/book` alias OK
- Book desktop 1280: barbers open (3 options); sentence-case “Signature Haircut”
- Chair/privacy/manage: paper→footer gap ~16px; shared footer retained
- Admin: cardH≈393 retained
- Desktop home: jump hidden; nav flex; atmosphere 155%; today Book secondary

### Residual / Round 4 handoff
- Hero still low-res square portrait — real shop photography would beat further CSS wash
- Book choose CTA still clips ~half button on 844px when description expanded; further header collapse or sticky choose CTA possible
- Selecting a service auto-opens barber and pushes CTA down again (intentional for barber path)
- Desktop dual solid Book (nav + hero) still intentional
- Manage token deep-link states still unexercised
- Short info pages: no third sticky; chrome stack on home remains header+jump+bottom Book (by design)

## Round 4 — 2026-07-21

### F.0 evidence
- Preview: `http://localhost:8788` → 200
- Captured: book choose CTA clip (390×844, visibleFrac≈0.08), home (390 + 1280), manage empty, admin sign-in, privacy, sms-terms (`/sms-terms`), chair-rental
- Pre-fix book metrics: ctaTop≈840 / vh=844 with description open; service change set `barberStepOpen=true` and pushed CTA further
- Post-edit: `npm run build` OK; hard-refresh `?v=r4-verify-*`

### Critique → fix map
1. **P1 · booking · choose CTA clip** — Selected service description pushed “Find the next opening” almost fully below fold on 844. **Visual evidence:** `r4-f0-book-choose-390`; ctaTop 840, visibleFrac≈0.08. **Fix:** `.ew-choose-dock` sticky bottom dock (context + CTA); clamp selected description to 1 line on ≤760.
2. **P1 · booking · service→barber jump** — Service radio `onChange` forced `setBarberStepOpen(true)`, expanding barber panel and displacing CTA. **Visual evidence:** after service click barberOpen became true. **Fix:** stop auto-open on service change; mobile stays first-available until optional reveal; desktop still starts open; barber fieldset uses `ew-rise` when disclosed.
3. **P2 · home · services/barbers polish** — Section leads long; photo flat; motion budget unused beyond card reveal. **Visual evidence:** services/barbers mobile scroll. **Fix:** tighter section leads + hierarchy; portrait vignette + subtle photo scale; service-link arrow nudge (3 motions with existing view-timeline reveal).
4. **P2 · admin · sign-in spacing/copy** — Brand gap + lead still airy. **Visual evidence:** admin cardH≈393 prior. **Fix:** brand margin 1.25rem; `.ewa-login-lead` microcopy; cardH≈363.
5. **P2 · manage · empty warmth** — Error panel read cold/technical. **Visual evidence:** manage empty pre-fix. **Fix:** `.ew-manage-empty` warm copy + detail strip; paper→footer gap≈16 retained.

### Files changed
- `client/src/pages/emmiwood/BookingFlow.tsx`
- `client/src/pages/emmiwood/EmmiwoodPage.tsx`
- `client/src/pages/emmiwood/EmmiwoodAdminPage.tsx`
- `client/src/pages/emmiwood/EmmiwoodManagePage.tsx`
- `client/src/pages/emmiwood/emmiwood.css`
- `docs/emmiwood-uiiter-log.md`

### Verify
- Book choose 390: dock `position:sticky`; CTA fully in view (ctaTop≈774, bottom≈825, vh=844); service select keeps barber closed + reveal; after reveal CTA still fully in view
- Book desktop 1280: barbers open (3 options); reveal hidden; sentence-case “Signature Haircut”; dock static
- Home 390: Emmiwood eyebrow, jump sticky, secondary today Book, atmosphere, servicesGap≈124 under jump
- Home 1280: jump hidden; nav flex; 5 service + 2 barber cards
- Admin: brandMb 20px; lead microcopy; cardH≈363
- Manage empty: warm h1 + lead; gap≈16; shared footer
- Privacy / sms-terms / chair-rental: footer + gap≈16

### Residual / Round 5 handoff
- Hero still low-res square portrait — real shop photography would beat further CSS wash
- Sticky choose dock + home sticky Book are separate surfaces; watch dock height if more barber options appear
- Desktop dual solid Book (nav + hero) still intentional
- Manage token deep-link / booked states still unexercised
- CSS layering remains multi-era; prefer further consolidation over new override slabs

## Round 5 — 2026-07-21

### F.0 evidence
- Preview: `http://localhost:8788` → 200
- Captured: book time (390 — controls/tabs/slots/selected), book details (390, stop before submit), home services/barbers (390), home (1280), manage empty, admin sign-in, privacy/sms-terms/chair-rental (HTTP 200)
- Pre-fix time metrics: controlsH≈285; sticky ctxH≈121 covering day tabs after scroll; sticky continue overlapping Evening slots; details heading `p` forced `display:none` (appointment when/who hidden)
- Post-edit: `npm run build` OK; hard-refresh `?v=r5-verify-*`

### Critique → fix map
1. **P1 · booking · time chrome density** — Availability controls stacked Selected date + date + Find next ≈285px before day tabs on 390. **Visual evidence:** `r5-f0-book-time-390`; first viewport = context + controls only. **Fix:** compact 2-col toolbar; hide selected-date `small`; 44px inputs; controlsH≈170.
2. **P1 · booking · sticky overlap** — Sticky context (121px @ top:72) covered day tabs/selected banner; sticky `.ew-time-actions` covered Evening slots. **Visual evidence:** `r5-f0-book-time-tabs-390` / selected. **Fix:** single-row sticky context (≈48px); `.ew-time-dock` sticky bottom with selected chip; stage `padding-bottom:132px`; tabs `scroll-margin-top`; after scroll tabsOverlap≈−12.
3. **P1 · booking · details context lost** — R3 hid all `.ew-stage-heading p` on ≤760, including “Wed… with Barro.” **Visual evidence:** details metrics `headingPDisplay:none`. **Fix:** `data-stage` on stages; hide lead only for choose/time; restore details/review `p` + `.ew-details-context` strip.
4. **P2 · home · Book competition** — Desktop nav + hero both solid Book; service/barber cards also solid CTAs vs sticky Book. **Visual evidence:** desktop hero dual solids; service cards each `hasBook`. **Fix:** `.ew-header-book` text-link on ≥761; barber card CTAs → underline text; service links remain text with clearer hover lift.
5. **P2 · details · empty message gap** — Empty `.ew-form-message` still reserved space. **Fix:** `.is-empty { display:none }`.
6. **P2 · CSS** — Scoped stage heading rule (R3) instead of blanket hide; shared dock pattern for choose/time without undoing R4 choose dock.

### Files changed
- `client/src/pages/emmiwood/BookingFlow.tsx`
- `client/src/pages/emmiwood/AvailabilityBrowser.tsx`
- `client/src/pages/emmiwood/EmmiwoodPage.tsx`
- `client/src/pages/emmiwood/emmiwood.css`
- `docs/emmiwood-uiiter-log.md`

### Verify
- Book time 390: controlsH≈170 (was≈285); ctxH≈48 sticky; tabs not covered (overlap≈−12); time-dock sticky + selected chip; Continue with 9:00 AM; R4 choose dock retained on choose
- Book details 390: heading p visible (“Wed, Jul 22, 9:00 AM with Barro.”); details context strip; empty form-message hidden; stopped before submit (no SMS)
- Book desktop 1280: barbers open (3); sentence-case “Signature Haircut”; choose dock static; time controls 3-col; slot grid 4-col
- Home 390: Emmiwood eyebrow; jump sticky; padBottom 78px; servicesGap≈124; atmosphere; stacked hero CTAs
- Home 1280: header Book text-link (transparent + underline); hero solid; today secondary; jump hidden; 5 services / 2 barbers; barber CTA text-link
- Admin: cardH≈363; brandMb 20px (R4 retained)
- Manage empty: warm copy; gap≈16; footer
- Privacy: footer + gap≈16; Back link

### Residual / Round 6 handoff
- Hero still low-res square portrait — real shop photography still the brand-plane upgrade
- Review stage + confirmation UI not fully exercised (no real book / SMS)
- Manage token deep-link / booked reschedule UI still unexercised
- Availability “Find next” + date picker still somewhat redundant with day tabs — further progressive disclosure possible
- Legacy CSS eras (pre-R1 + R1–R5) still multi-layered; safe merge candidates remain for a dedicated consolidation round
- Choose-dock height if barber list grows still watch-item

## Round 6 — 2026-07-21

### F.0 evidence
- Preview: `http://localhost:8788` → 200
- Captured: book time (390 — controls/tabs/evening under dock), book details → review with fake guest data (STOP before Confirm / no SMS), home visit/final/footer (390), home nav Book (1280), privacy/sms-terms/chair-rental, manage invalid-token hash, admin sign-in
- Pre-fix: eveningCoveredByDock=true (gap≈−211); review empty `.ew-form-message` display:block; Find next + selected-date + day tabs all visible; info h1 line-height 45.12 < 48px font-size; show-times H=38
- Post-edit: `npm run build` OK (×2); hard-refresh `?v=r6-verify-*` / `?v=r6-v2-*`

### Critique → fix map
1. **P1 · booking · review layout** — Flat 5-row dl with empty message gap; Confirm buried on long scroll. **Visual evidence:** `r6-f0-book-review-390`; msgDisplay:block empty; docH≈1225. **Fix:** `.ew-review-summary` When hero; drop duplicate When row; `is-empty` on form-message; sticky `.ew-review-dock` Confirm (crimson, contrast≈11.3). Stopped before Confirm (no SMS).
2. **P1 · booking · Find-next vs day-tabs** — Selected-date panel + Find next button + day tabs repeated the same job after autoFind. **Visual evidence:** controls still stacked with Find next solid. **Fix:** `.has-days` hides selected-date on ≤760; Find next → quiet text control (`is-quiet`); date picker label “Jump to date”; controlsH≈141.
3. **P1 · booking · evening under dock** — Sticky time dock covered Evening when scrolled. **Visual evidence:** eveningGap≈−211 / covered:true. **Fix:** stage padding-bottom 220px + scroll-margin on last period; max-scroll gap≈43, covered:false. R5 time-dock retained.
4. **P2 · home · visit/final/footer** — Visit tall (~1187) with airy map; final CTA competed with sticky Book; footer links short taps. **Visual evidence:** visit390 / final390. **Fix:** tighter visit/map/final padding; footer pad clears sticky Book; footer links min-height 44.
5. **P2 · info · typography** — h1 line-height tighter than font-size (48/45.12). **Fix:** h1 line-height 1.08 (≈51.8px); h2/p rhythm shared across privacy/sms/chair (gap≈16 retained).
6. **P2 · a11y** — show-times 38px; details labels ALL CAPS; field focus weak; Confirm/sticky contrast. **Fix:** show-times ≥44; details labels sentence case; clay focus ring+shadow; Confirm ivory-on-crimson; sticky Book contrast≈11.3.

### Files changed
- `client/src/pages/emmiwood/BookingFlow.tsx`
- `client/src/pages/emmiwood/AvailabilityBrowser.tsx`
- `client/src/pages/emmiwood/emmiwood.css`
- `docs/emmiwood-uiiter-log.md`

### Verify
- Book review 390: summary When strip; empty message hidden; sticky Confirm dock; stopped before submit (fake guest only)
- Book time 390: has-days; selected-date hidden; Find next quiet 44px; evening max-scroll gap≈43; show-times 44; R5 time-dock retained
- Book choose 390: choose-dock sticky; sentence-case “Signature Haircut”
- Book details: label transform none; focus border clay + shadow
- Home 390: visitH≈967 (was≈1187); map 240; footer links 44; sticky Book contrast≈11.3
- Home 1280: header Book text-link (transparent) retained
- Privacy/sms/chair: h1Lh≈51.8; gap≈16; Back 44
- Manage `#token=uiiter-r6-fake-not-a-secret`: invalid/expired detail (hash cleared after exchange); warm empty retained
- Admin: brandMb 20px retained

### Residual / Round 7 handoff
- Hero still low-res square portrait — real shop photography still the brand-plane upgrade
- Confirmation success UI still unexercised (intentionally — no live SMS book)
- Manage booked/reschedule UI still needs a real manage token (invalid-token empty state only this round)
- Desktop availability still shows selected-date + Find next + tabs — mobile progressive disclosure only
- Legacy CSS eras (pre-R1 + R1–R6) still multi-layered; dedicated consolidation round still warranted
- Choose-dock height if barber list grows still watch-item

## Round 7 — 2026-07-21

### F.0 evidence
- Preview: `http://localhost:8788` → 200
- Captured: home/barbers (390 + 1280), book choose/time/details/review, **confirmation via mocked POST** (no SMS / no real book), admin sign-in, manage empty, privacy/sms-terms/chair-rental
- Pre-fix: barber portrait `min-height:168px` in 78px grid col → bioOverlap=true (overlapArea≈1655); confirmation h1 lh 45.12 < 48px; mark scrolled under sticky header; admin empty `.ew-form-message` reserved space
- Post-edit: `npm run build` OK (×3); hard-refresh `?v=r7-verify-*` / `?v=r7-v2-*`

### Critique → fix map
1. **P1 · home-mobile · barber portrait overflow** — R5 `min-height:168px` on `.ew-barber-portrait` overflowed the 78px grid column and covered bio text. **Visual evidence:** `r7-f0-barbers-390`; bioOverlapPortrait=true. **Fix:** remove forced min-height; stack portrait above copy on ≤760; 16/10 aspect; denser bio (3-line clamp); stronger vignette; CTA → `.ew-barber-book` text link + arrow nudge.
2. **P1 · booking · confirmation success** — Reached safely by intercepting `POST /api/emmiwood/appointments` (mock payload; SMS consent unchecked; no Twilio). Flat receipt; h1 lh cramped; checkmark under sticky header after review scroll. **Visual evidence:** `r7-f0-confirm-390` / markTop≈10 under header. **Fix:** When hero strip (parity with review); crimson mark + `ew-confirm-mark` motion; h1 lh 1.08; scrollTo(0) on confirm; mark clears header (gap≈30).
3. **P2 · admin · empty message** — Empty form-message still reserved space on sign-in (only reachable surface without inventing credentials). **Fix:** `is-empty` hide; empty-state styles for agenda panel ready in CSS.
4. **P2 · motion** — Kept purposeful trio: card view-timeline reveal, photo/service/barber-book arrow motion, confirm mark scale-in. Removed janky portrait overflow; reduced-motion disables confirm + arrow transitions.
5. **P2 · CSS consolidation** — Dropped R5 portrait min-height conflict; R1 admin brand 2rem deferred to R4 1.25rem; aliased legacy `.ew-confirmation-receipt` to current receipt tokens; demoted barber button override → native `.ew-barber-book`.

### Files changed
- `client/src/pages/emmiwood/BookingFlow.tsx`
- `client/src/pages/emmiwood/EmmiwoodPage.tsx`
- `client/src/pages/emmiwood/EmmiwoodAdminPage.tsx`
- `client/src/pages/emmiwood/emmiwood.css`
- `docs/emmiwood-uiiter-log.md`

### Verify
- Confirm 390 (mock POST): When strip; crimson ✓ clear of header (markTop≈105, gap≈30); h1 lhOk; receipt 2 rows; Manage ivory-on-crimson; no SMS
- Barbers 390: stacked grid; overlap=false; vignette radial; text CTA `Book with Barro →`; sticky Book padBottom 78 retained
- Barbers 1280: side-by-side 150px|1fr; header Book transparent; jump hidden
- Book choose/time/review 390: docks sticky; Find next quiet; selected-date hidden; evening gap≈43 covered:false; sentence-case Signature Haircut
- Book 1280: barbers open; choose dock static
- Admin: msgDisplay none; brandMb 20px; cardH≈363
- Manage/privacy: gap≈16; info h1Lh≈51.8

### Residual / Round 8 handoff
- Hero still low-res square portrait — real shop photography still the brand-plane upgrade
- Admin workspace empty states (agenda/customers) styled in CSS but not visually verified without staff credentials
- Manage booked/reschedule UI still needs a real manage token
- Desktop availability still shows selected-date + Find next + tabs
- Legacy CSS eras still multi-layered; further merge of pre-R1 roster leftovers remains
- Choose-dock height if barber list grows still watch-item

## Round 8 — 2026-07-21

### F.0 evidence
- Preview: `http://localhost:8788` → 200
- Captured: home (390 + 1280), book choose/time/review, **confirmation via mocked POST** `{ok,data}` envelope (no SMS), manage empty, admin sign-in, privacy/sms-terms/chair-rental, loading probe
- Pre-fix: hero390≈1383 / today≈800; services≈2009; desktop has-days still showed selected-date (80px) + Find next + 7 tabs; `.emmiwood-loading` unstyled (Times / transparent); final CTA crimson competed with sticky Book
- Post-edit: `npm run build` OK (×2); hard-refresh `?v=r8-verify-*` / `?v=r8-v8-*`

### Critique → fix map
1. **P1 · home · composition density** — Hero + today + services + visit + final read as competing slabs; today packed walk-ins fact that duplicated the hours track; final crimson matched sticky Book. **Visual evidence:** `r8-f0-home-m390` heroH≈1383 todayH≈800; finalBg crimson. **Fix:** single Find-us fact; hide hours key on mobile; tighter section leads/copy; denser service rows (2-line clamp); final CTA → brown-deep brand band (sticky keeps crimson); h1 lh 1.05.
2. **P1 · booking · desktop Find-next redundancy** — After autoFind, selected-date panel + quiet Find next + day tabs all visible on 1280. **Visual evidence:** `bookTime1280` selectedDisplay:grid selectedH≈80. **Fix:** `has-days` hides selected-date on all viewports; desktop hides quiet Find next (Jump to date + tabs remain); controlsH≈105 (was≈114 with selected).
3. **P1 · shell · Suspense loading** — `.emmiwood-loading` had no CSS (main imports `emmiwood.css` but class unused). **Visual evidence:** probe font Times / bg transparent. **Fix:** full-viewport brown shell, E mark, gold spinner, Outfit uppercase; App fallback copy “Opening Emmiwood…”.
4. **P2 · manage · booked/cancel warmth** — Token still unforgeable; polished ManagePanel from source: cancelled state panel, quieter cancel zone, `is-empty` form-message, tighter appointment card.
5. **P2 · CSS consolidation** — Lifted has-days selected-date hide out of mobile-only media; merged home/final/today tweaks into existing public rules instead of a mega R8 override slab. Sticky docks (choose/time/review) + jump + Book untouched functionally.

### Files changed
- `client/src/App.tsx`
- `client/src/pages/emmiwood/EmmiwoodPage.tsx`
- `client/src/pages/emmiwood/BookingFlow.tsx`
- `client/src/pages/emmiwood/AvailabilityBrowser.tsx`
- `client/src/pages/emmiwood/emmiwood.css`
- `docs/emmiwood-uiiter-log.md`

### Verify
- Home 390: heroH≈1228 (was≈1383); todayH≈672 (was≈800); facts=1; hoursKey none; finalBg brown-deep; sticky Book crimson retained; jump sticky; servicesGap≈124; padBottom 78; lhOk; Emmiwood eyebrow; today Book secondary
- Home 1280: jump/sticky none; header Book transparent; 5 services / 2 barbers; final brown-deep
- Book choose 390: choose-dock sticky; CTA in view; Signature Haircut; barber closed
- Book time 390: selected none; Find next quiet; time-dock sticky; evening max-scroll gap≈43 covered:false
- Book time 1280: selected none; Find next display none; Jump to date; 7 tabs; controlsH≈105
- Review 390: summary + sticky Confirm dock; empty message hidden
- Confirm 390 (mock `{ok,data}` POST): When strip; markGap≈30; h1LhOk; receipt 2 rows; no SMS
- Loading: bg `#1b1411` + gradient; Outfit; ivory; minH 100svh
- Manage empty: warm h1; gap≈16; cancelled CSS present
- Admin: msgDisplay none; brandMb 20px; cardH≈363
- Privacy/sms/chair: footer present
- Barbers 390: overlap=false (R7 retained)

### Residual / Round 9 handoff
- Hero still low-res square portrait — real shop photography still the brand-plane upgrade
- Shop/weekly section still tall on mobile (~1114) — further merge with visit possible
- Manage booked/reschedule UI still needs a real manage token (cancelled/booked polished in source only)
- Admin workspace empty states still unverified without staff credentials
- Legacy CSS eras (pre-R1 roster leftovers) still multi-layered; dedicated purge round still warranted
- Choose-dock height if barber list grows still watch-item

## Round 9 — 2026-07-21

### F.0 evidence
- Preview: `http://localhost:8788` → 200
- Captured: home shop/services (390), book choose→time→details validation, manage invalid token, admin invalid email, privacy/sms/chair, desktop home + book choose/time
- Pre-fix: shopH≈1114 (7 identical day rows + dual shop paras); visitH≈905 with hours duplicate; service cards≈314 with muted price/link hierarchy; stage change left focus on prior control; admin soft-success had no invalid-format banner; public mark 42 vs app 36 on mobile
- Post-edit: `npm run build` OK (×4); hard-refresh `?v=r9-v*` / `?v=r9-v4*`

### Critique → fix map
1. **P1 · home-mobile · shop/weekly height** — Shop+weekly ~1114px with seven same-hour weekday rows + two statement paras; visit repeated hours. **Visual evidence:** `r9-f0-shop-m390`; shopH=1114 weeklyH=651. **Fix:** one statement para; compact Mon–Sat / Sunday hours list; visit drops hours copy (address + directions only). shopH≈567 visitH≈616.
2. **P1 · home · services rhythm** — After densify, price sat as header twin to index; link color competed with body; dl felt heavy. **Visual evidence:** cards≈314; priceColor brown-deep. **Fix:** name+price primary row; crimson price; meta line (duration · barbers); 1-line fit clamp; cards≈242; servicesH≈1538 (was≈1882).
3. **P1 · booking · keyboard/focus path** — Stage advances left focus on previous CTA; headings not in tab order. **Visual evidence:** after Find-next, focus not on time h2. **Fix:** stage h2 `tabIndex={-1}` + focus on stage change; clay focus rings on choices/buttons/slots; no focus trap. Tab outline on CTA = clay 3px; time stage activeIsH2=true.
4. **P1 · errors · validation / manage / admin** — Details message flat; manage invalid token used empty-state copy; admin malformed email had no banner (API soft-success for unknown addresses). **Visual evidence:** manage hash invalid; admin `not-an-email`. **Fix:** `.ew-form-message.is-error` banner + `role=alert` + `aria-invalid`; manage `has-error` copy; admin `noValidate` + format check → is-error panel.
5. **P2 · headers · brand mark parity** — Public header mark larger than app/admin on some breakpoints. **Fix:** shared 42 desktop / 36 mobile marks across site/app/auth headers.

### Files changed
- `client/src/pages/emmiwood/EmmiwoodPage.tsx`
- `client/src/pages/emmiwood/BookingFlow.tsx`
- `client/src/pages/emmiwood/EmmiwoodManagePage.tsx`
- `client/src/pages/emmiwood/EmmiwoodAdminPage.tsx`
- `client/src/pages/emmiwood/emmiwood.css`
- `docs/emmiwood-uiiter-log.md`

### Verify
- Home 390: shopH≈567 (was≈1114); hoursLi=2; visitH≈616; servicesH≈1538; cardH≈242; price/link crimson; brand 36; jump sticky; servicesGap≈124; sticky Book crimson; final brown-deep; padBottom 78; Emmiwood eyebrow
- Home 1280: jump/sticky none; header Book transparent; brand 42; 5 services / 2 barbers; hoursCompact=2; final brown-deep
- Book choose 390: choose-dock sticky; Signature Haircut; stage h2 focused; Tab → CTA clay outline
- Book time 390: time-dock sticky; selected none; evening gap≈43 covered:false; stage h2 focused after advance
- Book details 390: empty submit → “Enter your name.” is-error alert; aria-invalid; focus #ew-guest-name
- Book 1280: barbers open (3); choose dock static; selected none; Find next none; tabs=7; controlsH≈105
- Manage `#token=uiiter-r9-fake-not-a-secret`: has-error; alert detail; brand 36
- Admin invalid email: has-error; “Enter a valid shop email address.”; aria-invalid; msgBg warm; brandMb 20px
- Privacy/sms/chair: footer present; brand 36

### Residual / Round 10 handoff
- Hero still low-res square portrait — real shop photography still the brand-plane upgrade
- Manage booked/reschedule UI still needs a real manage token
- Admin workspace empty states still unverified without staff credentials
- Legacy CSS eras (pre-R1 roster leftovers) still multi-layered; dedicated purge round still warranted
- Choose-dock height if barber list grows still watch-item
- Visit map illustration still abstract (no invented photography) — real map/street photo would strengthen #visit

## Round 10 — 2026-07-21

### F.0 evidence
- Preview: `http://localhost:8788` → 200
- Captured: home (390 + 1280), book choose/time, manage invalid token, admin sign-in, privacy/sms/chair; hover probes (secondary + choice); `prefers-reduced-motion: reduce` on book stage
- Pre-fix: secondary hover inert outside today-card; choice cards no hover; sticky clearance split across 68/78px rules; chrome fog (“Live appointment book”, “Find the next opening”, “No online openings…”); reduced-motion scattered (9 rules) with rise/view still named; control radii mixed 0 vs 9–24px
- Post-edit: `npm run build` OK; hard-refresh `?v=r10-verify-*` / `?v=r10-jump2`

### Critique → fix map
1. **P1 · cohesion · tokens / radii** — Buttons sharp `0` while slots/panels used 9–24px; sticky pad dual-sourced (68 then 78). **Visual evidence:** home390 buttonRadius `0px` pre; stickyPad inconsistent in eras. **Fix:** `--ew-radius-control:10px`, `--ew-radius-panel:16px`, `--ew-radius-chip:12px`, `--ew-sticky-book:78px`; public padBottom=`78px`; choiceRadius=`12px`.
2. **P1 · interactions · hover/active/disabled** — Primary hover OK; secondary general hover inert; choices/slots lacked hover; disabled used `cursor:wait`. **Visual evidence:** hoverIdle===hoverActive on secondary; choice border/shadow unchanged. **Fix:** unified primary/secondary/inverse hover+active; choice/day-tab/slot hover+active press; disabled `opacity:.48; cursor:not-allowed`. Verified: secondary mouse→ crimson-deep; choiceHover changed:true.
3. **P1 · chrome copy micro-fog** — Sticky/booking “Live appointment book”; CTA “Find the next opening”; empty “No online openings…”. **Visual evidence:** sticky text LIVE APPOINTMENT BOOK. **Fix:** Appointments / Live openings / Find openings / Find next / No openings…; admin “Send code”; manage eyebrow “Appointment link”; loading “Opening…”.
4. **P2 · reduced-motion** — Duration crushed but rise/view/transform press still declared across eras. **Visual evidence:** book stage still named `ew-rise` under reduce (dur≈0.01ms). **Fix:** consolidated reduce block: `animation:none`, kill active transforms, spinner static, view-timeline off. Post: stageAnim `none`, btnTransDur `1e-05s`.
5. **P2 · safe-area / sticky regression** — env() present but not tokenized on all docks. **Fix:** choose/time/review docks `padding-bottom: calc(.4rem + env(safe-area-inset-bottom))`; sticky Book + footer clearance via `--ew-sticky-book`. Regression: jump→#services gap≈124; headerTop=0; sticky Book crimson-deep; shopH≈567 retained.

### Files changed
- `client/src/App.tsx`
- `client/src/pages/emmiwood/EmmiwoodPage.tsx`
- `client/src/pages/emmiwood/BookingFlow.tsx`
- `client/src/pages/emmiwood/AvailabilityBrowser.tsx`
- `client/src/pages/emmiwood/EmmiwoodAdminPage.tsx`
- `client/src/pages/emmiwood/EmmiwoodManagePage.tsx`
- `client/src/pages/emmiwood/emmiwood.css`
- `docs/emmiwood-uiiter-log.md`

### Verify
- Home 390: tokens radius 10 / sticky 78; pad 78; sticky “APPOINTMENTS Book now →”; crimson-deep dock; jump sticky (headerTop=0, jumpTop=66); Services gap≈124; shopH≈567; mark 36; Emmiwood eyebrow; buttonRadius 10
- Home 1280: jump/sticky none; mark 42; header Book transparent
- Hover: secondary → bg crimson-deep; choice card border+shadow on hover
- Book choose 390: eyebrow Appointments; Live openings; CTA Find openings; reveal “optional”; choose-dock sticky; Signature Haircut; barber closed; choiceRadius 12
- Book time 390: time-dock sticky; Find next; selected-date none
- Reduced-motion book: stageAnim none; transitions ~0
- Manage fake token: Appointment link; has-error; mark 36
- Admin: Send code; mark 36 crimson fill
- Privacy/sms/chair: footer; Back to the shop; mark 36

### Residual / Round 11 handoff
- Hero still low-res square portrait — real shop photography still the brand-plane upgrade
- Manage booked/reschedule UI still needs a real manage token
- Admin workspace empty states still unverified without staff credentials
- Legacy CSS eras still multi-layered; R10 added a cohesion overlay — a dedicated purge/merge pass would shrink the cascade
- Choose-dock height if barber list grows still watch-item
- Visit map illustration still abstract (no invented photography)

## Round 11 — 2026-07-21

### F.0 evidence
- Preview: `http://localhost:8788` → 200
- Captured: home (390 + 1280), book choose, manage invalid token, admin sign-in, privacy/sms/chair, visit scroll; hours-scale clip (desktop overlap → fixed)
- Pre-fix confusion audit (live): walk-in/noon–2 ×8; address ×2; Get directions ×2; today card Book + hero Book + sticky Book + Take this opening; South Minnesota Avenue ×3 (map + visit eyebrow + address); barbers h2/lead echoed first-available banner; hours scale Noon/2:00 overlapped (`Noo2:00 PM`); sticky `padding-bottom:68px` leftover fighting R10 `--ew-sticky-book:78px`; todayH≈672 / heroH≈1228
- Post-edit: `npm run build` OK (×2); hard-refresh `?v=r11-verify-*` / `?v=r11-final-*`

### Confusion audit (live surface)
1. **Today card packed** — status + scale + track + Find-us/walk-ins + next opening + Book + Directions duplicated Visit facts/CTAs
2. **Competing Books** — hero / today / sticky (mobile) / header+final (desktop) all “Book an appointment”
3. **Walk-in fact spam** — timeline, facts line, shop para, weekly hours
4. **Visit eyebrow stack** — Visit Emmiwood → Easy to find → South Minnesota Avenue → Emmiwood Barbers → full address
5. **Barbers message echo** — section intro “choose or first opening” + gold first-available banner
6. **Manage** — header + body both “Book another appointment”
7. **CSS override war** — `.emmiwood.ew-public { padding-bottom:68px }` under later 78px token
8. **Hours scale collision** — grid+translateX labels overlapping on ~460px card

### Critique → fix map
1. **P1 · home · today prune** — Removed Find-us facts block, hours legend, hours scale (times already in track), and today Book button. Card keeps status + day band + next opening + text “Get directions”. **Evidence:** todayH 672→475; heroH 1228→1031; walk-in hits 8→4; address on home 2→1; desktop todayHasBookBtn=false.
2. **P1 · home · barbers/visit/shop consolidate** — Barbers h2→“Meet the barbers.” / lead→“Different chairs, same finish standard.” (banner owns first-available). Visit drops South Minnesota Avenue eyebrow (map keeps label). Shop para drops noon–2 clause (weekly card owns it).
3. **P1 · manage · competing CTA** — Header “Book another appointment” → “Back to the shop” (matches info pages); body keeps Book + Call.
4. **P1 · CSS · sticky war** — Deleted legacy `padding-bottom:68px` and mid-era duplicate `78px` block; sole mobile clearance = R10 `--ew-sticky-book` token. Verified stickyPad=78px; jump gap≈124.
5. **P2 · booking · choose lead** — “Price and chair time…” → “Pick a service—barber is optional.” (dock already shows price/time).

### Files changed
- `client/src/pages/emmiwood/EmmiwoodPage.tsx`
- `client/src/pages/emmiwood/EmmiwoodManagePage.tsx`
- `client/src/pages/emmiwood/BookingFlow.tsx`
- `client/src/pages/emmiwood/emmiwood.css`
- `docs/emmiwood-uiiter-log.md`

### Verify
- Home 390: todayH≈475; heroH≈1031; no facts/key/scale; sticky “APPOINTMENTS Book now →”; pad 78; jump sticky gap≈124; mark 36; Emmiwood eyebrow; walkin≈4; visit eyebrows=[Visit Emmiwood]; barbers “Meet the barbers.”
- Home 1280: todayH≈467; no scale overlap; track labels only; today Book gone; directions text; header+hero+final Book (3); jump/sticky none; mark 42
- Book 390: Appointments / Live openings / Find openings; lead “Pick a service—barber is optional.”; Signature Haircut; choiceRadius 12; btnRadius 10
- Manage fake token: Back to the shop; body Book another; has-error alert; mark 36
- Admin: Send code
- Privacy/sms/chair: footer; Back to the shop; mark 36

### Residual / Round 12 handoff
- Hero still low-res square portrait — real shop photography still the brand-plane upgrade
- Mobile first viewport still has hero Book + sticky Book (intentional scroll dock) — further prune would mean sticky-only-after-scroll
- Manage error still lists phone in lead + Call link + footer (acceptable for recovery state)
- Legacy CSS eras still multi-layered; dead rules for `.ew-hours-scale` / `.ew-today-facts` remain until a purge pass
- Choose-dock height if barber list grows still watch-item
- Visit map illustration still abstract (no invented photography)
- Admin workspace / real manage token states still unverified

## Round 12 — 2026-07-21 (FINAL — loop close)

### F.0 evidence
- Preview: `http://localhost:8788` → 200
- Captured: home (390 + 1280), jump→#services, book choose + time (390), book choose (1280), manage invalid token, admin sign-in, privacy/sms/chair
- Pre-fix: stage h2 showed persistent clay 3px ring after programmatic focus (`outline: rgb(184,111,72) solid 3px`); `.emmiwood.ew-app-surface` shared ivory bg → cream band below short manage footer (`gapBelowFooter≈231`, sampled ivory); dead CSS for `.ew-hours-scale` / `.ew-hours-key` / `.ew-today-facts` still in cascade (0 DOM nodes)
- Post-edit: `npm run build` OK; hard-refresh `?v=r12-verify-*`

### Critique → fix map
1. **P1 · booking · stage focus ring** — Stage advance focused h2 with `:focus-visible` ring that read as a permanent brown border around “Start with the work.” **Evidence:** `tmp-r12-book-m390`; probe outline clay 3px while `activeElement===H2`. **Fix:** `focus({ preventScroll:true, focusVisible:false })` + explicit `:focus { outline:none }` (keyboard `:focus-visible` retained). Post: outline `none` with h2 still focused.
2. **P1 · app shell · ivory bleed** — Shared `.emmiwood.ew-public,.emmiwood.ew-app-surface { background:ivory }` outranked later black rules (2-class specificity). Short manage/info pages showed cream under dark footer. **Evidence:** manage `rootBg` ivory; pixel below footer ivory. **Fix:** split public ivory vs app-surface black; Round 12 lock + paper panels keep `color:black`. Post: manage/privacy/sms/chair `rootBg=rgb(27,20,17)`; below-footer sample black.
3. **P1 · CSS · dead today-card rules** — Purged unused `.ew-hours-scale`, `.ew-hours-key`, `.ew-today-facts` (and media overrides) after R11 DOM removal. Track/actions retained.

### Files changed
- `client/src/pages/emmiwood/BookingFlow.tsx`
- `client/src/pages/emmiwood/emmiwood.css`
- `docs/emmiwood-uiiter-log.md`

### Verify
- Home 390: todayH≈475; pad 78; sticky “APPOINTMENTS Book now →”; mark 36; jump sticky; Services gap≈124; btnRadius 10
- Home 1280: todayH≈467; sticky/jump none; mark 42; header Book present
- Book 390: h2 focused, outline none; lead “Pick a service—barber is optional.”; choiceRadius 12; choose-dock sticky bottom; rootBg black
- Book time 390: “Choose the time.”; time-dock sticky bottom=vh; Continue with a time
- Book 1280: barbers open path retained; choiceRadius 12; dock static; mark 42
- Manage fake token: Back to the shop; has-error alert; rootBg black (no cream bleed); mark 36
- Admin: Send code; mark 36
- Privacy/sms/chair: footer; Back to the shop; rootBg black; mark 36
- Dead DOM: scale/facts/key all false

### Deferred (explicit — out of P0/P1 / needs assets or credentials)
- Hero still low-res square portrait — needs real shop photography (do not invent)
- Visit map remains abstract illustration — needs real map/street photo
- Mobile hero Book + sticky Book coexistence — intentional; sticky-only-after-scroll is product choice
- Manage phone repeated in lead + Call + footer — acceptable recovery density
- Choose-dock height if barber list grows — watch-item
- Admin workspace / booked manage token states — unverified without credentials
- Full legacy CSS era merge (R1–R10 overlays) — structural purge beyond dead-rule removal; defer

### Exit status
**CLOSED** — Round 12 quality lock complete. Final-loop P0/P1 resolved or explicitly deferred. No interaction regressions (jump gap, sticky Book, time/choose docks, booking advance). F.0 verified after last execute. Round ledger 1–12 marked done.
