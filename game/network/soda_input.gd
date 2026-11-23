class_name SodaInput
extends RefCounted

var move := Vector2.ZERO
var aim := Vector2.RIGHT
var firing := false
var fire_pressed := false
var weapon := SodaState.Weapon.FOAM
var reload_pressed := false
var dash_pressed := false
var shield_pressed := false

func sample() -> Dictionary:
	var payload := {"moveX": move.x, "moveY": move.y, "aimX": aim.x, "aimY": aim.y,
		"fire": firing or fire_pressed, "weapon": int(weapon), "reload": reload_pressed,
		"dash": dash_pressed, "shield": shield_pressed}
	reload_pressed = false
	fire_pressed = false
	dash_pressed = false
	shield_pressed = false
	return payload
