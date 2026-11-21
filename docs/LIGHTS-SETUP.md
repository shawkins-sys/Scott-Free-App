# Lights tile setup (Hue through Alexa)

The Lights tile switches the Living room or Bedroom on, and turns all lights off. Three commands because the Voice Monkey free plan allows three triggers. To turn off one room only, use the Hue app. The app calls the `lights` Edge Function, which fires a Voice Monkey trigger, which starts an Alexa routine that switches the Hue room. The app cannot read whether the lights are on. "Open Hue" opens the Hue app for anything more.

## 1. Voice Monkey and Alexa

1. In the Alexa app, enable the **Voice Monkey** skill and link your Amazon account.
2. Sign in to the Voice Monkey console and create 3 **Routine Triggers** (names allow letters, numbers and spaces only). Current triggers and their device IDs, set in the function code:
   - Living room on: `living-room-on-pufsj`
   - Bedroom on: `bedroom-light-on-7qbzb`
   - All off: `all-lights-off-sbhmr`
3. Each trigger appears as a new device in the Alexa app.
4. In the Alexa app, create 3 routines. For each: **When** = the matching Voice Monkey device. **Action**: Living room power on; Bedroom power on; for `all-off`, two actions, Living room power off and Bedroom power off.
5. Test each trigger from the Voice Monkey playground.

If a trigger is ever recreated with a new ID, either update `DEVICES` in the function or add the new ID as a secret in step 2 below (`VM_LIVING_ROOM_ON`, `VM_BEDROOM_ON`, `VM_ALL_OFF`).

## 2. Supabase

1. **Edge Functions, Secrets:** add `VOICEMONKEY_TOKEN` with your Voice Monkey API token. Do not put it anywhere in the repo.
2. **Edge Functions, Deploy new function:** name `lights`, paste `supabase/functions/lights/index.ts`, deploy.
3. Open the function's **Details** and turn off **Verify JWT**. The function checks your sign-in and MFA itself.

## 3. Test on the phone

1. Open the app, complete the check-in, and find the Lights tile on Home (new tiles join the end of a saved layout).
2. Tap **On** for each room: the button shows "Sending..." then a tick, and the light switches within a second or two.
3. Tap **All off**: both rooms switch off.
4. Tap **Open Hue**: the Hue app opens (or the Play Store if it is not installed).

## Messages on the tile

- "Lights are not set up yet": token missing or wrong, or a trigger ID not found.
- "Too many presses": Voice Monkey throttle or monthly limit. Wait and try again.
- "That did not work": anything else. Check the function logs.

## iPhone

"Open Hue" goes to the App Store page on iPhone, as there is no public link into the Hue app on iOS. Revisit if the app is used on an iPhone.
