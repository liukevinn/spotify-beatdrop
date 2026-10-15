# M2 reliability spike: Spotify Connect with a locked iPhone

**Question:** Can DropSet reliably start playback on a locked iPhone after Spotify has been paused in the background for a while?

## How to run

1. Deploy (or run locally) and link your phone in **Settings → Device**.
2. Play any song in the Spotify app on the phone, then pause it.
3. Lock the phone and wait for the interval below.
4. From another device (laptop browser → Library → **Test**, or the "Cue Set" Shortcut on a second device), trigger playback.
5. Record whether the phone started playing, the error message if it didn't, and whether the device-fallback path recovered it.

## Results

| Idle time (paused, locked) | Attempt 1 | Attempt 2 | Attempt 3 | Notes |
|---|---|---|---|---|
| 0 min (just used) | | | | |
| 1 min | | | | |
| 3 min | | | | |
| 5 min | | | | |

Device / iOS version / Spotify app version:

## Conclusion

_If playback fails consistently at ≥ 3 minutes idle, add that to "Known limitations" in the README. Immediate cueing (phone just used) is the v1 happy path regardless._
