"""Original material sounds for the factory story. Run with Python 3 from any directory."""

from math import cos, sin, pi, tau
from random import Random

from build import OUT, Track, grain, sweep, tine


def air(track, at, duration, amplitude, pan, seed, throat=134, pulses=0.0):
    """A slowly swelling, filtered breath. The two filters leave room for quiet dialogue."""
    rng = Random(seed)
    low = 0.0
    mid = 0.0

    def sample(t):
        nonlocal low, mid
        noise = rng.uniform(-1, 1)
        mid += 0.37 * (noise - mid)
        low += 0.07 * (mid - low)
        swell = sin(pi * t / duration) ** 1.45
        flutter = 1 - pulses * (0.5 + 0.5 * sin(tau * t * 12.2))
        formant = 1 + 0.38 * sin(tau * throat * t + sin(tau * 2.1 * t))
        return amplitude * swell * flutter * ((mid - low) * formant + 0.46 * low)

    track.mix(at, duration, sample, pan)


def slap(track, at, amp, pan):
    sweep(track, at, 0.09, 360, 81, amp * 0.69, pan, 2.7)
    grain(track, at + 0.012, 0.14, amp * 0.94, pan, 0.54, 17)
    for i, offset in enumerate((0.063, 0.12, 0.159)):
        sweep(track, at + offset, 0.072, 250 + i * 108, 470 + i * 140, amp / (3 + i), pan)


def tiles():
    t = Track(2.24)
    # Clear the signing bell, then the far counter repeats exactly the near one's two syllables.
    for at, gain, pan in ((0.48, 0.41, -0.49), (1.30, 0.24, 0.73)):
        sweep(t, at, 0.20, 302, 355, gain, pan, 1.0)
        sweep(t, at + 0.245, 0.24, 362, 238, gain * 0.86, pan, 1.3)
        air(t, at + 0.04, 0.26, gain * 0.80, pan, 17, 142)
    t.save("two_answers")
    t = Track(0.64)
    for i, at in enumerate((0.012, 0.075, 0.187, 0.235)):
        grain(t, at, 0.058, 0.56 / (1 + 0.19 * i), -0.36 + i * 0.13, 0.84, 10 + i, 4)
        sweep(t, at, 0.10, 1380 - i * 126, 680 - i * 98, 0.23, -0.35 + i * 0.13, 4)
    tine(t, 0.235, 60, 0.33, 0.20, 0.10, 7)
    t.save("brick_crack")
    t = Track(1.47)
    for i, at in enumerate((0.02, 0.073, 0.22, 0.38, 0.58)):
        grain(t, at, 0.13, 0.58 - i * 0.065, -0.32 + 0.14 * i, 0.68, i + 70)
    sweep(t, 0.19, 0.49, 156, 40, 0.47, 0.17, 1.5)
    for i, at in enumerate((0.70, 1.01)):
        slap(t, at, 0.48 - i * 0.24, 0.51 - i * 0.63)
    t.save("brick_drop")
    t = Track(1.86)
    sweep(t, 0.05, 0.27, 166, 58, 0.33, -0.18)
    grain(t, 0.08, 0.29, 0.43, -0.16, 0.12, 80, 1.7)
    slap(t, 0.42, 0.57, -0.55)
    air(t, 0.53, 0.48, 0.54, -0.55, 91, 175, 0.32)
    sweep(t, 0.88, 0.28, 185, 65, 0.20, 0.13, 1.4)
    slap(t, 1.17, 0.31, 0.43)
    tine(t, 1.38, 55, 0.35, 0.13, 0.41, 8)
    t.save("brick_palm")


def well():
    t = Track(7.4)
    t.mix(0, 7.4, lambda s: 0.095 * sin(tau * 55 * s) *
          (0.69 + 0.22 * sin(tau * s / 7.4)) + 0.029 * sin(tau * 90 * s), -0.30)
    air(t, 0.29, 1.30, 0.54, 0.56, 14, 110)
    air(t, 1.72, 1.92, 0.42, 0.66, 15, 90, 0.15)
    for i, at in enumerate((4.52, 4.73, 5.14, 6.02)):
        sweep(t, at, 0.27, 525 + i * 20, 168, 0.18 if i == 0 else 0.07, (-0.59, 0.46)[i % 2])
    t.save("well_breath")
    t = Track(1.12)
    for i, at in enumerate((0.016, 0.09, 0.27, 0.47, 0.65)):
        pan = -0.51 + i * 0.21
        grain(t, at, 0.086, 0.53 if i < 3 else 0.30, pan, 0.72, 10 + i)
        sweep(t, at, 0.085, 962 - i * 66, 344, 0.20, pan)
    air(t, 0.42, 0.46, 0.46, 0.26, 80, 132, 0.8)
    t.save("tape_gate")
    t = Track(1.50)
    sweep(t, 0.04, 0.29, 100, 41, 0.28, -0.33)
    air(t, 0.19, 0.68, 0.77, 0.74, 302, 148)
    air(t, 0.88, 0.46, 0.45, 0.58, 303, 86)
    t.save("well_close")


def press():
    t = Track(4.8)
    t.mix(0, 4.8, lambda s: 0.10 * sin(tau * 46.25 * s + 0.12 * sin(tau * s / 2.4)), -0.15)
    for i, at in enumerate((0.09, 1.32, 2.51, 3.67)):
        pan = (-0.36, 0.29)[i % 2]
        air(t, at, 0.68, 0.58, pan, 320 + i, 85 + 5 * i, 0.65)
        sweep(t, at + 0.37, 0.36, 89, 54, 0.36, pan, 1.5)
        slap(t, at + 0.69, 0.31, pan)
    t.save("ink_roller")
    t = Track(1.14)
    sweep(t, 0.023, 0.30, 212, 45, 0.48, -0.17, 2.3)
    grain(t, 0.05, 0.23, 0.62, -0.17, 0.24, 9)
    for i, at in enumerate((0.16, 0.225, 0.31)):
        tine(t, at, 59 + 6 * i, 0.40, 0.20 / (1 + 0.4 * i), 0.49 - i * 0.35)
    air(t, 0.46, 0.46, 0.49, 0.31, 910, 105, 0.62)
    t.save("press_strike")
    t = Track(0.81)
    # Paper and wet skin part in the very quiet room after the power cut.
    air(t, 0.09, 0.40, 0.44, 0.74, 61, 160, 0.54)
    sweep(t, 0.51, 0.14, 340, 123, 0.17, 0.72)
    t.save("hand_loan")


def snore(track, at, dur, hz, pan, seed):
    def buzz(t):
        env = sin(pi * t / dur) ** 2
        wobble = 0.36 + 0.64 * (0.5 + 0.5 * cos(tau * (14 * t + 2 * t*t))) ** 2
        return 0.28 * env * wobble * (sin(tau * hz * t) + 0.39 * sin(tau * hz * 2.04 * t))
    track.mix(at, dur, buzz, pan)
    air(track, at, dur, 0.58, pan, seed, hz * 1.7, 0.58)


def last_watch():
    t = Track(8.0)
    # Four frogs in the panes: low rumble left; nasal double snort right; two softer answers.
    for at, dur, hz, pan in ((0.16, 1.14, 99, -0.64), (1.47, 0.53, 145, 0.69),
                            (2.11, 0.88, 145, 0.69), (3.72, 1.34, 82, 0.30),
                            (5.62, 0.93, 123, -0.32), (6.76, 0.59, 119, -0.32)):
        snore(t, at, dur, hz, pan, round(100 * at))
    t.save("sleep_gallery")
    t = Track(0.82)
    air(t, 0.04, 0.39, 0.39, -0.19, 101, 158, 0.7)
    for i, at in enumerate((0.17, 0.37, 0.54)):
        sweep(t, at, 0.18, 164 - 7 * i, 98, 0.37 / (1 + 0.16 * i), -0.13, 2.8)
    t.save("rubber_pulse")
    for name, direction in (("wheel_right", 1), ("wheel_left", -1)):
        t = Track(1.02)
        for i in range(8):
            at = 0.06 + i * 0.095
            pan = direction * (-0.87 + i * 1.74 / 7)
            grain(t, at, 0.07, 0.54, pan, 0.52, 12 + i)
            sweep(t, at, 0.081, 440 + i * 57, 215 + i * 19, 0.27, pan)
        sine_pan = direction * 0.73
        tine(t, 0.77, 71, 0.21, 0.21, sine_pan)
        t.save(name)
    t = Track(1.65)
    # Almost half a second with the gallery completely quiet, then eyelids, then breath.
    grain(t, 0.49, 0.055, 0.56, -0.17, 0.72, 41)
    sweep(t, 0.515, 0.24, 421, 73, 0.45, 0.12, 2.0)
    air(t, 0.55, 0.76, 0.94, 0.84, 190, 121)
    air(t, 0.59, 0.62, 0.51, -0.61, 194, 175)
    sweep(t, 1.11, 0.28, 98, 48, 0.34, 0.54, 2.1)
    t.save("wake_face")
    t = Track(3.1)
    for i, (at, note) in enumerate(((0.12, 67), (0.40, 72), (0.66, 71), (0.93, 67), (1.21, 64), (1.56, 60))):
        tine(t, at, note, 0.92, 0.34, (-0.38, 0.36)[i % 2], 3.2)
        tine(t, at + 0.15, note - 5, 0.74, 0.11, (0.36, -0.38)[i % 2], 4.2)
    for at, note in ((2.05, 67), (2.22, 72), (2.39, 76)):
        tine(t, at, note, 0.62, 0.15, 0.28, 5.6)
    t.save("dawn")


def build_story():
    OUT.mkdir(parents=True, exist_ok=True)
    tiles()
    well()
    press()
    last_watch()


if __name__ == "__main__":
    build_story()
