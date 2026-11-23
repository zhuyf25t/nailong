// A reversible end-to-end exercise, using the official MCP client over stdio.
const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const { StdioClientTransport } = require("@modelcontextprotocol/sdk/client/stdio.js");
const { randomBytes } = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");

async function connect(mode, binary) {
  const client = new Client({ name: "hw3-verifier", version: "1.0.0" });
  const transport = new StdioClientTransport({
    command: process.execPath, args: [path.join(__dirname, "studio.cjs"), mode, binary],
    env: Object.fromEntries(Object.entries(process.env).filter(([k]) => /^(systemroot|windir|temp|tmp|path|pathext|userprofile|appdata|localappdata|systemdrive|programdata|homedrive|homepath)$/i.test(k)))
  });
  await client.connect(transport);
  const { tools } = await client.listTools();
  console.log(mode + ": " + tools.map(t => t.name).join(", "));
  return client;
}

async function invoke(client, name, args = {}) {
  const result = await client.callTool({ name, arguments: args }, undefined, { timeout: 100000 });
  if (result.isError) throw new Error(name + " failed: " + result.content[0].text);
  return JSON.parse(result.content[0].text);
}

async function main() {
  const [blenderExe, godotExe] = process.argv.slice(2);
  if (!blenderExe || !godotExe) throw new Error("Usage: node smoke.cjs ABSOLUTE_BLENDER_EXE ABSOLUTE_GODOT_EXE");
  const root = path.resolve(__dirname, "../..");
  const name = "probe_" + randomBytes(8).toString("hex");
  const transform = { position: [0, 0, 0], rotation_degrees: [0, 0, 0], scale: [1, 1, 1] };
  const made = [];
  const clients = [];
  try {
    const blender = await connect("blender", blenderExe);
    clients.push(blender);
    const godot = await connect("godot", godotExe);
    clients.push(godot);
    console.log(await invoke(blender, "version"), await invoke(godot, "version"));
    const prop = await invoke(blender, "compose_prop", {
      name, parts: [{ name: "marker", primitive: "cone", color: "#e29a45", ...transform }]
    });
    made.push(prop.file);
    const blendFile = "mcp/" + name + ".blend";
    const info = await invoke(blender, "inspect_scene", { file: blendFile });
    if (info.object_count !== 1 || info.mesh_faces < 4) throw new Error("Unexpected geometry");
    const edited = await invoke(blender, "transform_copy", {
      file: blendFile, object: "marker", name: name + "_edited", ...transform, position: [0, 0, 1.25]
    });
    made.push(edited.file);
    const model = await invoke(blender, "export_glb", { file: "mcp/" + name + "_edited.blend", name });
    made.push(model.file, model.file + ".import");
    await invoke(godot, "import_project");
    const scene = await invoke(godot, "compose_scene", {
      name, instances: [{ name: "field_marker", model: "mcp/" + name + ".glb", ...transform }]
    });
    made.push(scene.file);
    if (scene.instance_count !== 1) throw new Error("Expected one Godot instance");
    const result = await invoke(godot, "run_scene", { scene: "scenes/mcp/" + name + ".tscn", frames: 10 });
    console.log("PASS: Blender composed + transformed + exported; Godot imported + packed + ran " + result.frames + " frames.");
  } finally {
    await Promise.allSettled(clients.map(c => c.close()));
    for (const relativeFile of made.reverse()) {
      if (!path.basename(relativeFile).startsWith(name)) throw new Error("Unexpected generated filename");
      await fs.rm(path.join(root, relativeFile), { force: true });
    }
  }
}

main().catch(err => { console.error(err.message); process.exitCode = 1; });
