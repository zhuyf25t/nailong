"""Physical foley for the return belts. Replay stems use the original impact inside a bottle."""
from math import sin, tau

from build import Track, grain, sweep, tine, OUT, RATE
from story import air


def recorded(track, name):
    track.save(name)
    # Glass mutes the low end and produces a short, asymmetric reflection.
    rendered = Track((len(track.left) + RATE // 9) / RATE)
    for channel, out, delay in ((track.left, rendered.left, 321), (track.right, rendered.right, 407)):
        low = previous = 0.0
        for i, v in enumerate(channel):
            low += 0.20 * (v - low)
            band = low - previous
            previous += 0.052 * (low - previous)
            out[i] += 0.90 * band
            out[i + delay] += 0.42 * band
            out[i + 2 * delay] += 0.17 * band
    rendered.save(name + "_inside")


def build_relay():
    OUT.mkdir(parents=True, exist_ok=True)
    t = Track(4)
    t.mix(0, 4, lambda x: (0.12 + 0.028 * sin(tau * 3 * x)) * sin(tau * 65 * x)
          + 0.046 * sin(tau * 130 * x) + 0.032 * sin(tau * 195 * x))
    for i in range(12):
        at = i / 3 + 0.03
        grain(t, at, 0.087, 0.21, (-0.29, 0.21)[i % 2], 0.26, 74 + i)
        sweep(t, at + 0.06, 0.09, 194, 103, 0.11, 0, 2.8)
    t.save("belt_motor")
    t = Track(0.36)
    tine(t, 0, 70, 0.15, 0.31, 0, 9)
    tine(t, 0.125, 76, 0.20, 0.33, 0, 10)
    t.save("neck_approach")
    t = Track(0.145)
    grain(t, 0, 0.025, 0.39, 0, 0.80)
    tine(t, 0.008, 85, 0.127, 0.44, 0, 12)
    t.save("neck_open")
    t = Track(0.30)
    grain(t, 0.003, 0.055, 0.79, 0, 0.84, 71)
    sweep(t, 0, 0.14, 360, 80, 0.53)
    tine(t, 0.019, 77, 0.25, 0.41, 0, 9)
    t.save("grip_lock")
    t = Track(0.63)
    # Gas escapes in two short valves before the pressurised neck rattles.
    for at, duration, amp, seed in ((0.01, 0.11, 0.44, 70), (0.14, 0.43, 0.66, 85)):
        air(t, at, duration, amp, 0, seed, 466, 0.10)
    tine(t, 0.41, 88, 0.14, 0.15, 0, 12)
    t.save("bottle_hiss")
    t = Track(0.60)
    for i, at in enumerate((0.01, 0.21)):
        sweep(t, at, 0.17, (390, 254)[i], (224, 105)[i], 0.42)
        grain(t, at, 0.094, 0.41, 0, 0.51, i + 11)
    t.save("lower_belt")
    t = Track(0.89)
    sweep(t, 0, 0.20, 204, 53, 0.46)
    for i, at in enumerate((0.003, 0.067, 0.13, 0.251, 0.38, 0.54)):
        amp = 0.55 / (1 + i * 0.31)
        grain(t, at, 0.09, amp, 0, 0.88, i + 17)
        tine(t, at + 0.016, 74 + (i * 7) % 17, 0.24, amp * 0.6)
    t.save("belt_break")
    t = Track(0.49)
    for i, at in enumerate((0.0, 0.10, 0.19)):
        sweep(t, at, 0.13, 576 - i * 110, 204 + i * 35, 0.31)
        grain(t, at, 0.063, 0.37, 0, 0.60, i)
    t.save("route_toggle")
    t = Track(0.32)
    sweep(t, 0, 0.135, 147, 57, 0.56)
    grain(t, 0.017, 0.17, 0.49, 0, 0.33, 65)
    tine(t, 0.035, 58, 0.22, 0.23, 0.0, 15)
    recorded(t, "plate_step")
    t = Track(0.60)
    grain(t, 0, 0.064, 0.55, 0, 0.82, 55)
    for note, amp in ((65, 0.38), (79, 0.22), (87, 0.12)):
        tine(t, 0.008, note, 0.52, amp, 0.0, 7.3)
    recorded(t, "pipe_rim")
    t = Track(0.69)
    for at, n in ((0.01, 78), (0.14, 85)):
        tine(t, at, n, 0.47, 0.44, 0, 6)
    recorded(t, "receipt_chime")
    t = Track(0.52)
    for i, at in enumerate((0.015, 0.108, 0.18, 0.235)):
        grain(t, at, 0.05, 0.39, 0.0, 0.65, 92 + i)
        sweep(t, at, 0.09, 1030 - i * 103, 345, 0.26)
    sweep(t, 0.258, 0.19, 164, 53, 0.31)
    t.save("pipe_nails")
    t = Track(0.53)
    # The signature bell is allowed to speak first. The lip of the slot shifts at the right ear.
    grain(t, 0.115, 0.069, 0.59, 0.75, 0.76, 224)
    sweep(t, 0.133, 0.23, 272, 62, 0.44, 0.54, 1.5)
    air(t, 0.14, 0.36, 1.07, 0.85, 318, 161)
    t.save("relay_face")


if __name__ == "__main__":
    build_relay()
