package soda.night

/** Events shared by the campaign simulation, subtitles, sound and sprite animation. */
type StoryCue =
  "none" | "hatch" | "wrong_window" | "watch_longer" | "delay_found" | "delay_open" |
  "archive_turn" | "ledger" | "record_start" | "replay_start" | "retry_gate" |
  "gate_pass" | "echo_hold" | "sleep_show" | "sleep_close" | "brace_light" |
  "brace_set" | "hand_warn" | "ward_slip" | "brace_missed" | "wake_chime" |
  "wake_answer" | "wrong_bottle" | "round_clear" | "ward_face" | "ward_clear"
