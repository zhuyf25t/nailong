"""Render the original score and foley for Night Shift. Python 3, standard library only."""

from array import array
from math import exp, pi, sin, sqrt
from pathlib import Path
from random import Random
import sys
import wave


RATE = 16000
TAU = 2 * pi
OUT = Path(__file__).resolve().parents[2] / "game/assets/night/audio"


class Track:
    def __init__(self, duration):
        self.left = [0.0] * round(duration * RATE)
        self.right = [0.0] * len(self.left)

    def mix(self, start, duration, shape, pan=0.0):
        begin = round(start * RATE)
        length = min(round(duration * RATE), len(self.left) - begin)
        gains = sqrt((1 - pan) / 2), sqrt((1 + pan) / 2)
        for i in range(length):
            val = shape(i / RATE)
            self.left[begin + i] += val * gains[0]
            self.right[begin + i] += val * gains[1]

    def save(self, name):
        # Equal gain across clips preserves their dynamics. Smooth sample-boundary transitions.
        samples = array("h")
        end = len(self.left) - 1
        for i, (left, right) in enumerate(zip(self.left, self.right)):
            fade = min(1.0, i / 32, (end - i) / 80)
            for value in (left, right):
                samples.append(round(30000 * fade * max(-1, min(1, value))))
        if sys.byteorder == "big":
            samples.byteswap()
        with wave.open(str(OUT / (name + ".wav")), "wb") as output:
            output.setparams((2, 2, RATE, 0, "NONE", "not compressed"))
            output.writeframes(samples.tobytes())


def freq(midi):
    return 440 * 2 ** ((midi - 69) / 12)


def tine(track, at, note, duration, amp, pan=0.0, decay=4.0):
    f = freq(note)
    def sound(t):
        ph = TAU * f * t
        env = min(1.0, t / 0.006, (duration - t) / 0.04) * exp(-decay * t)
        return amp * env * (sin(ph) + 0.32 * sin(2.005 * ph) + 0.11 * sin(3.03 * ph))
    track.mix(at, duration, sound, pan)


def sweep(track, at, length, start, end, amp, pan=0.0, decay=3):
    def sound(t):
        ph = TAU * t * (start + (end - start) * t / (2 * length))
        attack = min(1.0, t / 0.004, (length - t) / 0.012)
        return amp * attack * exp(-decay * t / length) * (sin(ph) + 0.15 * sin(2.1 * ph))
    track.mix(at, length, sound, pan)


def grain(track, at, length, amp, pan=0.0, lowpass=0.33, seed=1, decay=4):
    rng = Random(seed)
    smooth = 0
    def sound(t):
        nonlocal smooth
        smooth += lowpass * (rng.uniform(-1, 1) - smooth)
        env = min(1.0, t / 0.006, (length - t) / 0.012) * exp(-decay * t / length)
        return amp * env * smooth
    track.mix(at, length, sound, pan)


def radio():
    # Four-bar lullaby twice; the second answer settles back into C. The rests are intentional.
    beat = 0.56
    t = Track(24 * beat)
    walk = [(48, 55, 64), (45, 52, 60), (50, 57, 65), (43, 53, 59),
            (48, 55, 64), (45, 55, 60), (43, 53, 59), (48, 55, 64)]
    for i, (root, third, fifth) in enumerate(walk):
        onset = i * beat * 3
        tine(t, onset, root, 0.72, 0.16, -0.1)
        for off in (beat, 2 * beat):
            tine(t, onset + off, third, 0.38, 0.060, 0.1)
            tine(t, onset + off, fifth, 0.40, 0.053, 0.15)
    melody = [(0, 67), (1.5, 72), (2, 71), (3, 69), (5, 64), (6, 65), (7, 69),
              (8.5, 67), (10, 62), (12, 67), (13.5, 72), (14, 74), (15, 72),
              (17, 69), (18, 67), (19.5, 65), (20.5, 62), (21, 64), (22, 60)]
    for onset, note in melody:
        tine(t, onset * beat + 0.018, note, 0.76, 0.29, -0.18, 3.7)
        tine(t, onset * beat + 0.108, note, 0.48, 0.052, 0.26)
    t.save("radio")


def beds():
    t = Track(6)
    t.mix(0, 6, lambda s: 0.15 * sin(TAU * 58 * s + 0.22 * sin(TAU * s / 2))
          + 0.055 * sin(TAU * 116 * s) + 0.044 * sin(TAU * 174 * s), -0.16)
    for i in range(6):
        at = i + 0.23
        sweep(t, at, 0.066, 1460, 815, 0.19, 0.45, 5)
        grain(t, at, 0.044, 0.44, 0.45, seed=i)
    for i, at in enumerate((0.72, 1.02, 3.68)):
        sweep(t, at, 0.13, 560 + i * 22, 1040, 0.12, -0.64)
    t.save("plant")
    t = Track(2.4)
    for i, at in enumerate((0.05, 0.27, 0.87, 1.07, 1.64, 1.86)):
        pan = (-0.45, 0.35)[i % 2]
        sweep(t, at, 0.24, 95, 37, 0.58, pan, 2.3)
        grain(t, at + 0.014, 0.14, 0.44, pan, 0.16, i)
    t.mix(0, 2.4, lambda s: 0.10 * sin(TAU * 50 * s + 0.14 * sin(TAU * 5 * s)))
    t.save("pursuit")


def foley():
    for side, pan in (("left", -0.75), ("right", 0.75)):
        t = Track(0.58)
        for i, at in enumerate((0, 0.125, 0.204, 0.258)):
            sweep(t, at, 0.100, 1390 + i * 110, 840 + i * 80, 0.49 / (1 + i), pan * i / 3)
            grain(t, at, 0.048, 0.46 / (1 + i), pan * i / 3, 0.85, i)
        tine(t, 0.238, 88, 0.22, 0.14, pan)
        t.save("cap_" + side)
    t = Track(0.42)
    grain(t, 0, 0.32, 0.52, 0, 0.30)
    sweep(t, 0.025, 0.3, 610, 270, 0.27)
    t.save("throw")
    for side, pan in (("left", -0.72), ("right", 0.72)):
        t = Track(0.36)
        sweep(t, 0, 0.095, 365, 98, 0.72, pan)
        tine(t, 0.004, 85, 0.23, 0.36, pan)
        tine(t, 0.020, 80, 0.25, 0.12, -pan)
        t.save("bounce_" + side)
    t = Track(0.42)
    grain(t, 0, 0.12, 0.42, 0, 0.8)
    sweep(t, 0, 0.22, 190, 88, 0.50)
    sweep(t, 0.10, 0.14, 160, 90, 0.19, 0.1)
    t.save("blocked")
    t = Track(0.88)
    for at, n in ((0, 72), (0.12, 76), (0.25, 79)):
        tine(t, at, n, 0.55, 0.37, 0.08)
    t.save("deliver")
    t = Track(0.63)
    for i, at in enumerate((0, 0.135, 0.30)):
        sweep(t, at, 0.14, 360 - i * 28, 210 - i * 18, 0.29, -0.15 + i * 0.14, 1.2)
    t.save("chuckle")
    # All three booths have the same latch. Only the stereo position changes.
    for slot, pan in enumerate((-0.75, 0, 0.75)):
        t = Track(0.36)
        grain(t, 0.024, 0.14, 0.44, pan, 0.22, 4, 2.5)
        sweep(t, 0.035, 0.105, 218, 138, 0.30, pan)
        tine(t, 0.143, 82, 0.16, 0.16, pan, 11.0)
        t.save("glass_" + str(slot))
    t = Track(0.58)
    grain(t, 0, 0.14, 0.50, 0.30, 0.55)
    sweep(t, 0.08, 0.27, 220, 53, 0.39, 0.31, 2)
    t.save("relay")
    t = Track(1.6)
    # Latch drags across the counter. Two footsteps then land on the player's side.
    grain(t, 0.025, 0.32, 0.72, -0.49, 0.31, 3, 1.0)
    sweep(t, 0.026, 0.23, 945, 315, 0.26, -0.46, 1.8)
    sweep(t, 0.36, 0.13, 404, 102, 0.67, -0.20)
    for at, pan in ((0.80, 0.39), (1.15, 0.74)):
        sweep(t, at, 0.25, 148, 43, 0.69, pan, 2)
        grain(t, at, 0.28, 0.66, pan, 0.135)
    t.save("latch")
    t = Track(0.52)
    for at, freq_hz in ((0, 565), (0.11, 980)):
        grain(t, at, 0.12, 0.55, -0.10, 0.55)
        sweep(t, at, 0.11, freq_hz, 130, 0.38)
    t.save("lever")
    t = Track(1.85)
    for at, n in ((0.00, 67), (0.21, 72), (0.41, 71), (0.63, 67), (0.88, 64), (1.13, 60)):
        tine(t, at, n, 0.65, 0.39, 0.0, 3.7)
    t.save("clockout")
    t = Track(0.82)
    sweep(t, 0, 0.32, 115, 37, 0.52, -0.26)
    grain(t, 0.13, 0.3, 0.62, 0.20, 0.12, 23, 1.5)
    t.save("shutter")
    t = Track(0.22)
    sweep(t, 0, 0.13, 680, 604, 0.29, 0.2)
    t.save("pressure")


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    radio()
    beds()
    foley()
