package soda.night

/** Events shared by the campaign simulation, subtitles, sound and sprite animation. */
type StoryCue =
  "fourth_roll" | "fourth_step" | "fourth_pipe" | "fourth_bell" |
  "tile_warn" | "tile_open" | "tile_fall" |
  "none" | "hatch" | "wrong_window" | "watch_longer" | "delay_found" | "delay_open" |
  "archive_turn" | "ledger" | "record_start" | "replay_start" | "retry_gate" |
  "seal_early" | "plate_ready" | "press_caught" | "tape_rewind" | "sill_wait" | "sill_missed" | "press_slam" |
  "gate_pass" | "echo_hold" | "sleep_show" | "sleep_close" | "brace_light" |
  "brace_set" | "hand_warn" | "ward_slip" | "brace_missed" | "ward_relay_late" | "wake_chime" |
  "wake_answer" | "wrong_bottle" | "round_clear" | "ward_face" | "ward_clear"
